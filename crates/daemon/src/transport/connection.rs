use std::collections::HashMap;
use std::sync::Arc;
use std::time::{Duration, Instant};

use soromi_protocol::{ClientMessage, IncompatibleAction, PROTOCOL_VERSION, ServerMessage, Status};
use tokio::sync::broadcast;
use tokio::task::JoinHandle;

use super::coalesce::{Coalescer, until};
use super::outbound::{Closed, Frame, LinkState, Outbound};
use crate::accounts::store::FileAccountManager;
use crate::pairing::PairingService;
use crate::sessions::chat::ChatSession;
use crate::sessions::delta::DeltaFrame;
use crate::sessions::session::Session;
use crate::workspaces::service::{CreateSpaceInput, WorkspaceService};

/// Chat messages sent per page: the recent tail on attach, and each "Load earlier" step.
const CHAT_PAGE: usize = 80;

/// Terminal output is merged over this window. Short enough to be invisible, long enough that a
/// burst of small reads becomes a few frames.
const OUTPUT_WINDOW: Duration = Duration::from_millis(5);
/// A terminal frame is sent early once it holds this much, however fast output is arriving.
const OUTPUT_MAX_BATCH: usize = 64 * 1024;

/// Streaming chat text is merged over this window: about twenty updates a second at most.
const DELTA_WINDOW: Duration = Duration::from_millis(50);
const DELTA_MAX_BATCH: usize = 16 * 1024;

/// Per-connection message routing. A viewport lists and opens workspaces, attaches to one,
/// then its input/resize drives that session while output and status stream back. Owns the
/// attach forwarders so they can be replaced on re-attach and cancelled on disconnect.
pub struct Connection {
    hub: Arc<WorkspaceService>,
    accounts: Arc<FileAccountManager>,
    /// Present only on the trusted local link; device management is refused without it.
    pairing: Option<Arc<PairingService>>,
    out: Outbound,
    /// What this connection's tasks share about the client: its protocol version, whether it is
    /// there, and which directories it has listed.
    link: Arc<LinkState>,
    /// Whether this client has already been told it cannot be served, so it is told only once.
    refused: bool,
    attached: HashMap<String, JoinHandle<()>>,
    /// The slot each attached terminal's binary output frames are tagged with.
    slots: HashMap<String, u16>,
    /// Forwards notification banners to this viewport as `Notify` messages, while it has opted into
    /// native notifications (the Electron shell). Its live broadcast subscription is what tells the
    /// controller to route banners here instead of firing them via the OS.
    notify_task: Option<JoinHandle<()>>,
    /// This viewport's id, used to gate input/resize to the controller and to claim control.
    viewer_id: u64,
}

impl Connection {
    pub fn new(
        hub: Arc<WorkspaceService>,
        accounts: Arc<FileAccountManager>,
        pairing: Option<Arc<PairingService>>,
        out: Outbound,
        link: Arc<LinkState>,
        viewer_id: u64,
    ) -> Self {
        Self {
            hub,
            accounts,
            pairing,
            out,
            link,
            refused: false,
            attached: HashMap::new(),
            slots: HashMap::new(),
            notify_task: None,
            viewer_id,
        }
    }

    pub fn handle(&mut self, message: ClientMessage) {
        // Nothing is served before a hello this daemon can speak to. A client that skips it is one
        // from before the handshake existed: it is told to update, once, and otherwise ignored.
        if !self.link.is_ready() && !matches!(message, ClientMessage::Hello { .. }) {
            if !self.refused {
                self.refused = true;
                self.send(ServerMessage::Incompatible {
                    protocol: PROTOCOL_VERSION,
                    action: IncompatibleAction::UpdateClient,
                });
            }
            return;
        }
        match message {
            ClientMessage::Hello { protocol, .. } => {
                // A hello starts a client from scratch. On a relay link a new device can take over
                // the daemon's standing socket, so whatever the last one had attached is dropped.
                self.reset_client();
                if protocol == PROTOCOL_VERSION {
                    self.link.set_protocol(protocol);
                    self.send(ServerMessage::Welcome {
                        protocol: PROTOCOL_VERSION,
                        version: crate::updates::current_version().to_string(),
                    });
                } else {
                    self.refused = true;
                    self.send(ServerMessage::Incompatible {
                        protocol: PROTOCOL_VERSION,
                        action: if protocol < PROTOCOL_VERSION {
                            IncompatibleAction::UpdateClient
                        } else {
                            IncompatibleAction::UpdateDaemon
                        },
                    });
                }
            }
            ClientMessage::Ping { nonce } => self.send(ServerMessage::Pong { nonce }),
            ClientMessage::ListWorkspaces => {
                // A viewport (re)connecting always asks for the workspace list; reply with the
                // current control state too, so a fresh page (e.g. a phone that refreshed) knows
                // whether it drives or shows the takeover, even if it missed the control broadcast.
                send_state(&self.hub, &self.out);
                self.send_control();
            }
            ClientMessage::OpenWorkspace { dir } => match self.hub.open_workspace(&dir) {
                Ok(result) => self.send(ServerMessage::WorkspaceOpened {
                    workspace: result.workspace,
                    warning: result.warning,
                }),
                Err(error) => self.send(ServerMessage::Error {
                    message: error.to_string(),
                }),
            },
            ClientMessage::CreateSpace {
                name,
                root,
                agent,
                account,
                folders,
            } => match self.hub.create_space(CreateSpaceInput {
                name,
                root,
                agent,
                account,
                folders,
            }) {
                Ok(result) => self.send(ServerMessage::WorkspaceOpened {
                    workspace: result.workspace,
                    warning: result.warning,
                }),
                Err(error) => self.send(ServerMessage::Error {
                    message: error.to_string(),
                }),
            },
            ClientMessage::RemoveSpace { workspace } => self.hub.remove_space(&workspace),
            ClientMessage::ReorderSpaces { order } => self.hub.reorder_spaces(&order),
            ClientMessage::UpdateSpace {
                workspace,
                name,
                accounts,
                folders,
                root,
                instructions,
            } => {
                match self
                    .hub
                    .update_space(&workspace, name, accounts, folders, root, instructions)
                {
                    Ok(result) => self.send(ServerMessage::WorkspaceOpened {
                        workspace: result.workspace,
                        warning: result.warning,
                    }),
                    Err(error) => self.send(ServerMessage::Error {
                        message: error.to_string(),
                    }),
                }
            }
            ClientMessage::OpenSession {
                workspace,
                agent,
                account,
                mode,
            } => match self
                .hub
                .open_session(&workspace, agent, account, mode.unwrap_or_default())
            {
                Ok(session) => self.send(ServerMessage::SessionOpened { workspace, session }),
                Err(error) => self.send(ServerMessage::Error {
                    message: error.to_string(),
                }),
            },
            ClientMessage::CloseSession { session } => self.hub.close_session(&session),
            ClientMessage::ChatTurn {
                session,
                text,
                files,
            } => {
                // A chat turn is "input": only the controlling viewport may drive the agent.
                if self.hub.is_controller(self.viewer_id)
                    && let Some(chat) = self.hub.get_chat(&session)
                {
                    tokio::spawn(async move { chat.send_turn(&text, &files).await });
                }
            }
            ClientMessage::ChatInterrupt { session } => {
                // Stop button: interrupt the running turn. Same control gate as a chat turn.
                if self.hub.is_controller(self.viewer_id)
                    && let Some(chat) = self.hub.get_chat(&session)
                {
                    tokio::spawn(async move { chat.interrupt().await });
                }
            }
            ClientMessage::ChatApprovalResponse { session, id, allow } => {
                // Allow/deny a pending tool approval — the same control gate as driving the agent.
                if self.hub.is_controller(self.viewer_id)
                    && let Some(chat) = self.hub.get_chat(&session)
                {
                    tokio::spawn(async move { chat.respond_approval(&id, allow).await });
                }
            }
            ClientMessage::ChatPermissionMode { session, mode } => {
                // The composer's permission dropdown: apply live and persist.
                if self.hub.is_controller(self.viewer_id) {
                    self.hub.set_permission_mode(&session, mode);
                }
            }
            ClientMessage::ChatSetModel {
                session,
                model,
                effort,
            } => {
                // The composer's model dropdown: apply live and persist.
                if self.hub.is_controller(self.viewer_id) {
                    self.hub.set_model(&session, model, effort);
                }
            }
            ClientMessage::ChatCommand { session, command } => {
                // The composer's context controls (/compact, /clear).
                if self.hub.is_controller(self.viewer_id) {
                    self.hub.run_chat_command(&session, command);
                }
            }
            ClientMessage::ChatLoadEarlier { session, loaded } => {
                // "Load earlier": send the page of messages just before what the viewport holds.
                if let Some(chat) = self.hub.get_chat(&session) {
                    let (events, has_more) = chat.chat_earlier(loaded as usize, CHAT_PAGE);
                    if !events.is_empty() {
                        self.send(ServerMessage::ChatHistory {
                            session,
                            events,
                            has_more,
                        });
                    }
                }
            }
            ClientMessage::SwitchMode { session, mode } => {
                // Restarts the session in the other backend (resumes the same conversation).
                if self.hub.is_controller(self.viewer_id) {
                    self.hub.switch_mode(&session, mode);
                }
            }
            ClientMessage::SetSessionAgent {
                session,
                agent,
                account,
            } => {
                // Restarts the session under a different agent (fresh conversation). Gated by control.
                if self.hub.is_controller(self.viewer_id) {
                    self.hub.set_session_agent(&session, agent, account);
                }
            }
            ClientMessage::RenameSession { session, title } => {
                self.hub.rename_session(&session, title)
            }
            ClientMessage::ExportSpace { workspace } => match self.hub.export_space(&workspace) {
                Ok(path) => self.send(ServerMessage::SpaceExported { workspace, path }),
                Err(error) => self.send(ServerMessage::Error {
                    message: error.to_string(),
                }),
            },
            ClientMessage::CheckProvider {
                provider,
                config_dir,
            } => {
                let logged_in = crate::accounts::provider::is_logged_in(&provider, &config_dir);
                self.send(ServerMessage::ProviderStatus {
                    provider,
                    config_dir,
                    logged_in,
                });
            }
            ClientMessage::MuteWorkspace { workspace, muted } => {
                self.hub.set_muted(&workspace, muted)
            }
            ClientMessage::SetKeepAwakeMode { mode } => self.hub.set_keep_awake_mode(mode),
            ClientMessage::ListDir { workspace, path } => {
                // Remember it, so this viewport is told when that directory changes on disk.
                self.link.mark_listed(&workspace, &path);
                let entries = self.hub.list_dir(&workspace, &path);
                self.send(ServerMessage::DirListing {
                    workspace,
                    path,
                    entries,
                });
            }
            ClientMessage::ReadFile { workspace, path } => {
                let file = self.hub.read_file(&workspace, &path);
                self.send(ServerMessage::FileContent {
                    workspace,
                    path,
                    content: file.content,
                    truncated: file.truncated,
                    binary: file.binary,
                });
            }
            ClientMessage::WriteFile {
                workspace,
                path,
                content,
            } => match self.hub.write_file(&workspace, &path, &content) {
                Ok(()) => self.send(ServerMessage::FileSaved { workspace, path }),
                Err(error) => self.send(ServerMessage::Error {
                    message: format!("couldn't save {path}: {error}"),
                }),
            },
            ClientMessage::OpenShell {
                workspace,
                shell,
                folder,
            } => {
                // Spawning a shell only makes it viewable; typing into it is still gated by `Input`,
                // so this isn't controller-gated. Surface a spawn failure instead of swallowing it.
                if let Err(error) = self.hub.open_shell(&workspace, &shell, &folder) {
                    self.send(ServerMessage::Error {
                        message: format!("couldn't open terminal: {error}"),
                    });
                }
            }
            ClientMessage::GitStatus { workspace } => {
                let status = self.hub.git_status(&workspace);
                self.send(ServerMessage::GitStatus { workspace, status });
            }
            ClientMessage::GitDiff {
                workspace,
                path,
                staged,
            } => {
                let (patch, truncated) = self.hub.git_diff(&workspace, &path, staged);
                self.send(ServerMessage::GitDiff {
                    workspace,
                    path,
                    staged,
                    patch,
                    truncated,
                });
            }
            ClientMessage::ListSkills { session } => {
                let skills = self.hub.list_skills(&session);
                self.send(ServerMessage::SkillList { session, skills });
            }
            ClientMessage::ListModels => {
                self.send(ServerMessage::ModelCatalog {
                    catalog: crate::providers::all_catalogs(),
                });
            }
            ClientMessage::ListAccounts => self.send_accounts(),
            ClientMessage::SaveAccount { profile } => {
                let _ = self.accounts.save(&profile);
                self.send_accounts();
            }
            ClientMessage::DeleteAccount { name } => {
                let _ = self.accounts.remove(&name);
                self.send_accounts();
            }
            ClientMessage::CreateDevice { name } => {
                if let Some(pairing) = &self.pairing {
                    let device = pairing.create_device(name);
                    let _ = self.out.send(ServerMessage::DevicePaired { device });
                }
            }
            ClientMessage::ListDevices => {
                if let Some(pairing) = &self.pairing {
                    let _ = self.out.send(ServerMessage::DeviceList {
                        devices: pairing.list_devices(),
                    });
                }
            }
            ClientMessage::RevokeDevice { id } => {
                if let Some(pairing) = &self.pairing {
                    let _ = self.out.send(ServerMessage::DeviceList {
                        devices: pairing.revoke_device(&id),
                    });
                }
            }
            ClientMessage::GetRemoteConfig => {
                // Local-link only, like device management: the relay is a host setting.
                if self.pairing.is_some() {
                    self.send(ServerMessage::RemoteConfig {
                        config: crate::config::remote_config(),
                    });
                }
            }
            ClientMessage::SetRemoteConfig { config } => {
                if let Some(pairing) = &self.pairing {
                    match crate::config::set_remote_config(&config) {
                        Ok(resolved) => {
                            // Apply live so new pairings + existing dials use the new relay + key.
                            pairing.set_remote(
                                resolved.relay_url.clone(),
                                resolved.access_key.clone(),
                            );
                            self.send(ServerMessage::RemoteConfig { config: resolved });
                        }
                        Err(error) => self.send(ServerMessage::Error {
                            message: error.to_string(),
                        }),
                    }
                }
            }
            ClientMessage::CheckUpdate => {
                // Run the check off the message loop; report back to this viewport. A found
                // update goes through the hub so every viewport's banner updates, not just this one.
                let hub = self.hub.clone();
                let out = self.out.clone();
                tokio::spawn(async move {
                    match crate::updates::check(crate::updates::current_version()).await {
                        Some(info) => hub.set_update(info),
                        None => {
                            let _ = out.send(ServerMessage::UpToDate);
                        }
                    }
                });
            }
            ClientMessage::RequestUsage { workspace, force } => {
                // Fetch off the message loop: it makes network calls per agent.
                let hub = self.hub.clone();
                let out = self.out.clone();
                tokio::spawn(async move {
                    let agents = hub.request_usage(&workspace, force).await;
                    let _ = out.send(ServerMessage::Usage { workspace, agents });
                });
            }
            ClientMessage::TakeControl => self.hub.take_control(self.viewer_id),
            // The native desktop shell reports its window focus so the daemon suppresses sounds and
            // banners while the user is looking at the app.
            ClientMessage::SetFocused { focused } => self.hub.set_focused(focused),
            // The Electron shell renders banners itself: forward notifications to it as `Notify`
            // messages (while it stays subscribed, the daemon skips the OS notifier).
            ClientMessage::NotificationsNative { enabled } => {
                self.set_notifications_native(enabled)
            }
            ClientMessage::Attach { session } => self.attach(&session),
            ClientMessage::Detach { session } => {
                if let Some(forwarder) = self.attached.remove(&session) {
                    forwarder.abort();
                }
            }
            ClientMessage::Input { session, data } => {
                // Only the controlling viewport drives the terminal.
                if self.hub.is_controller(self.viewer_id)
                    && let Some(session) = self.hub.get(&session)
                {
                    session.write(&data);
                    // Submitting (Enter) starts a new turn: the agent is working again.
                    if data.contains('\r') {
                        session.mark_active();
                    }
                }
            }
            ClientMessage::Resize {
                session,
                cols,
                rows,
            } => {
                // Only the controller owns the size; others render the takeover, not the terminal.
                if self.hub.is_controller(self.viewer_id)
                    && let Some(session) = self.hub.get(&session)
                {
                    session.resize(cols, rows);
                }
            }
        }
    }

    fn send(&self, message: ServerMessage) {
        let _ = self.out.send(message);
    }

    /// Turns native-notification forwarding on or off. While on, a task subscribes to the hub's
    /// notification broadcast and relays each banner to this viewport as a `Notify` message; the
    /// subscription's presence is what makes the controller route banners here. Aborting the task
    /// (here or on disconnect) drops the subscription, so the daemon falls back to the OS notifier.
    fn set_notifications_native(&mut self, enabled: bool) {
        if let Some(task) = self.notify_task.take() {
            task.abort();
        }
        if !enabled {
            return;
        }
        let mut rx = self.hub.subscribe_notifications();
        let out = self.out.clone();
        self.notify_task = Some(tokio::spawn(async move {
            loop {
                match rx.recv().await {
                    Ok(banner) => {
                        if out
                            .send(ServerMessage::Notify {
                                title: banner.title,
                                body: banner.body,
                                workspace: Some(banner.workspace),
                                session: banner.session,
                            })
                            .is_err()
                        {
                            break;
                        }
                    }
                    Err(broadcast::error::RecvError::Lagged(_)) => continue,
                    Err(broadcast::error::RecvError::Closed) => break,
                }
            }
        }));
    }

    /// Sends this viewport its control state: `None` holder when it drives, else the controller's
    /// name (so it shows the takeover).
    fn send_control(&self) {
        let holder = if self.hub.is_controller(self.viewer_id) {
            None
        } else {
            self.hub.controller_name()
        };
        self.send(ServerMessage::Control { holder });
    }

    fn send_accounts(&self) {
        self.send(ServerMessage::AccountList {
            accounts: self.accounts.list(),
        });
    }

    /// Drops everything tied to the client on the other end: the device left, or a new one said
    /// hello on the same link. Stops its streams and forgets what it had attached and listed.
    pub fn reset_client(&mut self) {
        for (_, handle) in self.attached.drain() {
            handle.abort();
        }
        self.slots.clear();
        if let Some(task) = self.notify_task.take() {
            task.abort();
        }
        self.refused = false;
        self.link.reset();
    }

    /// The slot this connection tags a session's terminal frames with, assigned on first attach.
    fn slot_for(&mut self, session_id: &str) -> u16 {
        if let Some(slot) = self.slots.get(session_id) {
            return *slot;
        }
        let slot = self.slots.len() as u16;
        self.slots.insert(session_id.to_string(), slot);
        slot
    }

    /// Replays a session's current state, then streams it. Re-attaching replaces the prior
    /// forwarder, so nothing is streamed twice for one session on one connection.
    fn attach(&mut self, session_id: &str) {
        if let Some(previous) = self.attached.remove(session_id) {
            previous.abort();
        }
        // Restored tabs are spawned lazily: the first attach starts the backend from its persisted
        // spec (a no-op if it's already live), so opening a tab is what launches its agent.
        self.hub.ensure_session(session_id);
        // A tab is either a PTY terminal or a headless chat; attach whichever exists.
        let id = session_id.to_string();
        let out = self.out.clone();
        let handle = if let Some(session) = self.hub.get(session_id) {
            let slot = self.slot_for(session_id);
            tokio::spawn(async move {
                let _ = forward_pty(out, id, session, slot).await;
            })
        } else if let Some(chat) = self.hub.get_chat(session_id) {
            tokio::spawn(async move {
                let _ = forward_chat(out, id, chat).await;
            })
        } else {
            return;
        };
        self.attached.insert(session_id.to_string(), handle);
    }
}

/// Where a terminal's output goes on one connection: binary frames tagged with its slot.
struct TerminalSink {
    out: Outbound,
    slot: u16,
}

impl TerminalSink {
    async fn write(&self, data: String) -> Result<(), Closed> {
        self.out
            .stream(Frame::Terminal {
                slot: self.slot,
                data,
            })
            .await
    }

    /// Wipes the viewport's terminal (`ESC c`) and redraws it from the scrollback: on attach, and
    /// again whenever the viewport fell too far behind to catch up chunk by chunk.
    async fn repaint(&self, snapshot: String) -> Result<(), Closed> {
        self.write(format!("\u{1b}c{snapshot}")).await
    }
}

/// Streams a PTY terminal to one viewport: the slot its output is tagged with, the screen so far
/// and its status, then output, status,
/// and transcript events as they happen. Output is merged over [`OUTPUT_WINDOW`], and every send
/// waits for room in the connection's queue; a viewport slow enough to miss output is repainted
/// from the scrollback instead of being sent a backlog it will never catch up on.
async fn forward_pty(
    out: Outbound,
    id: String,
    session: Arc<Session>,
    slot: u16,
) -> Result<(), Closed> {
    out.stream_message(ServerMessage::Attached {
        session: id.clone(),
        slot,
    })
    .await?;
    let sink = TerminalSink {
        out: out.clone(),
        slot,
    };
    let (snapshot, mut output_rx) = session.attach_output();
    sink.repaint(snapshot).await?;

    let mut status_rx = session.subscribe_status();
    let mut last_status = *status_rx.borrow_and_update();
    send_status(&out, &id, last_status).await?;

    // Reset the chat view, then replay the transcript so far. A session with no transcript
    // (non-Claude, or before its first hook) sends the reset and no events, so the viewport falls
    // back to the terminal.
    let mut chat_rx = session.subscribe_chat();
    send_pty_chat(&out, &id, &session).await?;

    let mut output = Coalescer::new(OUTPUT_WINDOW, OUTPUT_MAX_BATCH);
    loop {
        tokio::select! {
            chunk = output_rx.recv() => match chunk {
                Ok(data) => {
                    if let Some(text) = output.push(&data, Instant::now()) {
                        sink.write(text).await?;
                    }
                }
                Err(broadcast::error::RecvError::Lagged(_)) => {
                    output.clear();
                    let (snapshot, rx) = session.attach_output();
                    output_rx = rx;
                    sink.repaint(snapshot).await?;
                }
                Err(broadcast::error::RecvError::Closed) => break,
            },
            _ = until(output.deadline()) => {
                if let Some(text) = output.take(Instant::now()) {
                    sink.write(text).await?;
                }
            }
            changed = status_rx.changed() => {
                if changed.is_err() {
                    break;
                }
                let status = *status_rx.borrow_and_update();
                if status != last_status {
                    last_status = status;
                    send_status(&out, &id, status).await?;
                }
            }
            event = chat_rx.recv() => match event {
                Ok(event) => {
                    out.stream_message(ServerMessage::Chat {
                        session: id.clone(),
                        events: vec![event],
                    })
                    .await?;
                }
                Err(broadcast::error::RecvError::Lagged(_)) => {
                    chat_rx = session.subscribe_chat();
                    send_pty_chat(&out, &id, &session).await?;
                }
                Err(broadcast::error::RecvError::Closed) => break,
            },
        }
    }
    Ok(())
}

/// Streams a headless chat session to one viewport: its status, the recent transcript, the reply in
/// progress, pending approvals and slash commands, then each as it changes. Streaming text is sent
/// as the new piece only, merged over [`DELTA_WINDOW`]; a viewport that falls behind is re-synced
/// from the session's current state rather than replayed.
async fn forward_chat(out: Outbound, id: String, chat: Arc<ChatSession>) -> Result<(), Closed> {
    let mut status_rx = chat.subscribe_status();
    let mut last_status = *status_rx.borrow_and_update();
    send_status(&out, &id, last_status).await?;

    let mut chat_rx = chat.subscribe_chat();
    let mut approval_rx = chat.subscribe_approval();
    let mut resolved_rx = chat.subscribe_resolved();
    send_chat_state(&out, &id, &chat).await?;
    let mut delta_rx = send_delta_snapshot(&out, &id, &chat, false).await?;

    let mut commands_rx = chat.subscribe_commands();
    let commands = commands_rx.borrow_and_update().clone();
    if !commands.is_empty() {
        out.stream_message(ServerMessage::SessionCommands {
            session: id.clone(),
            commands,
        })
        .await?;
    }

    let mut delta = Coalescer::new(DELTA_WINDOW, DELTA_MAX_BATCH);
    loop {
        tokio::select! {
            changed = status_rx.changed() => {
                if changed.is_err() {
                    break;
                }
                let status = *status_rx.borrow_and_update();
                if status != last_status {
                    last_status = status;
                    send_status(&out, &id, status).await?;
                }
            }
            event = chat_rx.recv() => match event {
                Ok(event) => {
                    out.stream_message(ServerMessage::Chat {
                        session: id.clone(),
                        events: vec![event],
                    })
                    .await?;
                }
                Err(broadcast::error::RecvError::Lagged(_)) => {
                    // Events were missed: start the view over from the session's current state.
                    chat_rx = chat.subscribe_chat();
                    send_chat_state(&out, &id, &chat).await?;
                    delta.clear();
                    delta_rx = send_delta_snapshot(&out, &id, &chat, true).await?;
                }
                Err(broadcast::error::RecvError::Closed) => break,
            },
            frame = delta_rx.recv() => match frame {
                Ok(DeltaFrame::Append(text)) => {
                    if let Some(text) = delta.push(&text, Instant::now()) {
                        send_delta(&out, &id, text, false).await?;
                    }
                }
                Ok(DeltaFrame::Reset) => {
                    // The live message is gone; text still held for it must not follow it out.
                    delta.clear();
                    send_delta(&out, &id, String::new(), true).await?;
                }
                Err(broadcast::error::RecvError::Lagged(_)) => {
                    delta.clear();
                    delta_rx = send_delta_snapshot(&out, &id, &chat, true).await?;
                }
                Err(broadcast::error::RecvError::Closed) => break,
            },
            _ = until(delta.deadline()) => {
                if let Some(text) = delta.take(Instant::now()) {
                    send_delta(&out, &id, text, false).await?;
                }
            }
            approval = approval_rx.recv() => match approval {
                Ok(approval) => {
                    out.stream_message(ServerMessage::ChatApproval {
                        session: id.clone(),
                        approval,
                    })
                    .await?;
                }
                Err(broadcast::error::RecvError::Lagged(_)) => continue,
                Err(broadcast::error::RecvError::Closed) => break,
            },
            resolved = resolved_rx.recv() => match resolved {
                Ok(approval_id) => {
                    out.stream_message(ServerMessage::ChatApprovalResolved {
                        session: id.clone(),
                        id: approval_id,
                    })
                    .await?;
                }
                Err(broadcast::error::RecvError::Lagged(_)) => continue,
                Err(broadcast::error::RecvError::Closed) => break,
            },
            changed = commands_rx.changed() => {
                if changed.is_err() {
                    break;
                }
                let commands = commands_rx.borrow_and_update().clone();
                out.stream_message(ServerMessage::SessionCommands {
                    session: id.clone(),
                    commands,
                })
                .await?;
            }
        }
    }
    Ok(())
}

async fn send_status(out: &Outbound, session: &str, status: Status) -> Result<(), Closed> {
    out.stream_message(ServerMessage::Status {
        session: session.to_string(),
        status,
    })
    .await
}

async fn send_delta(
    out: &Outbound,
    session: &str,
    text: String,
    replace: bool,
) -> Result<(), Closed> {
    out.stream_message(ServerMessage::ChatDelta {
        session: session.to_string(),
        text,
        replace,
    })
    .await
}

/// Resets a PTY session's chat view and replays its transcript so far.
async fn send_pty_chat(out: &Outbound, id: &str, session: &Session) -> Result<(), Closed> {
    out.stream_message(ServerMessage::ChatReset {
        session: id.to_string(),
    })
    .await?;
    let events = session.chat_snapshot();
    if !events.is_empty() {
        out.stream_message(ServerMessage::Chat {
            session: id.to_string(),
            events,
        })
        .await?;
    }
    Ok(())
}

/// Resets a headless chat view and sends what it needs to start from: the recent tail of the
/// transcript (the viewport pages back with `ChatLoadEarlier`, so a long one doesn't flood the wire)
/// and any tool approvals still awaiting an answer.
async fn send_chat_state(out: &Outbound, id: &str, chat: &ChatSession) -> Result<(), Closed> {
    out.stream_message(ServerMessage::ChatReset {
        session: id.to_string(),
    })
    .await?;
    let (tail, has_more) = chat.chat_tail(CHAT_PAGE);
    if !tail.is_empty() || has_more {
        out.stream_message(ServerMessage::ChatHistory {
            session: id.to_string(),
            events: tail,
            has_more,
        })
        .await?;
    }
    for approval in chat.approval_snapshot() {
        out.stream_message(ServerMessage::ChatApproval {
            session: id.to_string(),
            approval,
        })
        .await?;
    }
    Ok(())
}

/// Sends the reply in progress as a whole (a viewer joining mid-turn should see it) and returns a
/// feed of the changes after it. With `always`, an empty reply is sent too, to clear a stale one.
async fn send_delta_snapshot(
    out: &Outbound,
    id: &str,
    chat: &ChatSession,
    always: bool,
) -> Result<broadcast::Receiver<DeltaFrame>, Closed> {
    let (text, rx) = chat.delta_attach();
    if always || !text.is_empty() {
        send_delta(out, id, text, true).await?;
    }
    Ok(rx)
}

impl Drop for Connection {
    /// Stops the per-session output/status forwarders when the connection ends, whether it exits
    /// normally or its task is cancelled (e.g. the device was revoked). Without this the forwarders
    /// leak and keep the relay socket's writer alive.
    fn drop(&mut self) {
        for (_, handle) in self.attached.drain() {
            handle.abort();
        }
        // Drop the notification subscription so a disconnecting native viewer stops holding the
        // controller in "route to wire" mode (the OS notifier resumes when none remain).
        if let Some(task) = self.notify_task.take() {
            task.abort();
        }
    }
}

/// Sends the current workspace list and app-wide state, in reply to a viewport asking for it.
pub fn send_state(hub: &WorkspaceService, out: &Outbound) {
    let _ = out.send(ServerMessage::WorkspaceList {
        workspaces: hub.summaries(),
    });
    let _ = out.send(ServerMessage::KeepAwake {
        active: hub.keep_awake_active(),
        mode: hub.keep_awake_mode(),
    });
    if let Some(update) = hub.update_info() {
        let _ = out.send(ServerMessage::UpdateAvailable {
            version: update.version,
            url: update.url,
            notes: update.notes,
        });
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::sessions::stream_json::StreamJsonSession;
    use soromi_protocol::{ChatEvent, PermissionMode};
    use tokio::sync::mpsc;

    /// One `stream_event` line carrying a piece of assistant text, as the agent prints it.
    fn text_delta(text: &str) -> String {
        format!(
            r#"{{"type":"stream_event","event":{{"type":"content_block_delta","index":0,"delta":{{"type":"text_delta","text":"{text}"}}}}}}"#
        )
    }

    /// A headless chat session backed by a shell script standing in for the agent: it waits for the
    /// first turn on stdin, then prints `script`'s stream-json lines.
    fn scripted_chat(script: &str) -> Arc<ChatSession> {
        let provider = crate::providers::provider("claude").expect("claude provider");
        let session = StreamJsonSession::spawn(
            provider,
            "/bin/sh",
            &["-c".to_string(), format!("read _\n{script}\nsleep 5")],
            ".",
            None,
            Vec::new(),
            PermissionMode::Default,
        )
        .expect("spawn stand-in agent");
        Arc::new(ChatSession::StreamJson(session))
    }

    /// Collects the streaming-text frames sent until the assistant message commits.
    async fn deltas_until_commit(rx: &mut mpsc::Receiver<Frame>) -> Vec<(String, bool)> {
        let mut deltas = Vec::new();
        let mut committed = false;
        loop {
            let frame = tokio::time::timeout(Duration::from_secs(5), rx.recv())
                .await
                .expect("timed out waiting for the reply")
                .expect("forwarder ended");
            match frame {
                Frame::Message(ServerMessage::ChatDelta { text, replace, .. }) => {
                    deltas.push((text, replace));
                    // The clearing frame after the commit is the last one of interest.
                    if committed {
                        return deltas;
                    }
                }
                Frame::Message(ServerMessage::Chat { events, .. })
                    if events
                        .iter()
                        .any(|event| matches!(event, ChatEvent::Assistant { .. })) =>
                {
                    committed = true;
                    if matches!(deltas.last(), Some((text, true)) if text.is_empty()) {
                        return deltas;
                    }
                }
                _ => {}
            }
        }
    }

    #[tokio::test]
    async fn streaming_text_is_sent_as_new_pieces_then_cleared_on_commit() {
        // Pieces spaced wider than the merge window, so each one travels on its own.
        let script = [
            format!("printf '%s\\n' '{}'", text_delta("Hel")),
            "sleep 0.2".to_string(),
            format!("printf '%s\\n' '{}'", text_delta("lo")),
            "sleep 0.2".to_string(),
            format!("printf '%s\\n' '{}'", text_delta(" world")),
            "sleep 0.2".to_string(),
            r#"printf '%s\n' '{"type":"assistant","message":{"role":"assistant","content":[{"type":"text","text":"Hello world"}]}}'"#.to_string(),
        ]
        .join("\n");
        let chat = scripted_chat(&script);
        let (out, mut rx, _stalled) = Outbound::channel();
        tokio::spawn(forward_chat(out, "s1".to_string(), chat.clone()));

        chat.send_turn("hi", &[]).await;
        let deltas = deltas_until_commit(&mut rx).await;

        // Each frame carries only what is new; the last one clears the live message.
        assert_eq!(
            deltas,
            vec![
                ("Hel".to_string(), false),
                ("lo".to_string(), false),
                (" world".to_string(), false),
                (String::new(), true),
            ]
        );
    }

    #[tokio::test]
    async fn a_burst_of_streaming_text_is_merged_into_a_few_frames() {
        // Forty pieces with no pause between them, then a pause before the commit.
        let mut lines: Vec<String> = (0..40)
            .map(|_| format!("printf '%s\\n' '{}'", text_delta("ab")))
            .collect();
        lines.push("sleep 0.3".to_string());
        lines.push(
            r#"printf '%s\n' '{"type":"assistant","message":{"role":"assistant","content":[{"type":"text","text":"done"}]}}'"#
                .to_string(),
        );
        let chat = scripted_chat(&lines.join("\n"));
        let (out, mut rx, _stalled) = Outbound::channel();
        tokio::spawn(forward_chat(out, "s1".to_string(), chat.clone()));

        chat.send_turn("hi", &[]).await;
        let deltas = deltas_until_commit(&mut rx).await;

        let appended: Vec<&str> = deltas
            .iter()
            .filter(|(_, replace)| !replace)
            .map(|(text, _)| text.as_str())
            .collect();
        // Nothing lost or repeated, in far fewer frames than pieces.
        assert_eq!(appended.concat(), "ab".repeat(40));
        assert!(
            appended.len() <= 5,
            "expected the burst merged into a few frames, got {}",
            appended.len()
        );
    }
}
