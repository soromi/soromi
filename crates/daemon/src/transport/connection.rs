use std::collections::HashMap;
use std::sync::Arc;
use std::sync::atomic::{AtomicBool, Ordering};
use std::time::{Duration, Instant};

use soromi_protocol::{
    ChatCursor, ClientMessage, IncompatibleAction, PROTOCOL_VERSION, ServerMessage, SessionMode,
    Status,
};
use tokio::sync::{broadcast, watch};
use tokio::task::JoinHandle;

use super::coalesce::{Coalescer, until};
use super::outbound::{Closed, Frame, LinkState, Outbound};
use crate::accounts::store::FileAccountManager;
use crate::pairing::PairingService;
use crate::sessions::chat::ChatSession;
use crate::sessions::chat_log::{ChatLog, LogFrame, Start};
use crate::sessions::delta::DeltaFrame;
use crate::sessions::session::{Output, Session, Snapshot};
use crate::workspaces::service::{CreateSpaceInput, WorkspaceService};

/// Chat messages sent per page: the recent tail on attach, and each "Load earlier" step. It is also
/// how far behind a returning viewport may be and still be caught up event by event.
const CHAT_PAGE: usize = 80;

/// Terminal output is merged over this window. Short enough to be invisible, long enough that a
/// burst of small reads becomes a few frames.
const OUTPUT_WINDOW: Duration = Duration::from_millis(5);
/// A terminal frame is sent early once it holds this much, however fast output is arriving.
const OUTPUT_MAX_BATCH: usize = 64 * 1024;

/// Streaming chat text is merged over this window: about twenty updates a second at most.
const DELTA_WINDOW: Duration = Duration::from_millis(50);
const DELTA_MAX_BATCH: usize = 16 * 1024;
/// The largest picture a paired device is sent to show (see `Connection::image_limit`).
const DEVICE_IMAGE_LIMIT: u64 = 2 * 1024 * 1024;
/// The largest picture the app on this computer is sent to show.
const LOCAL_IMAGE_LIMIT: u64 = 32 * 1024 * 1024;

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
    /// showing them itself (the Electron shell, the phone app). The shell's live broadcast
    /// subscription is what tells the controller to route banners to it instead of firing them via
    /// the OS.
    notify_task: Option<JoinHandle<()>>,
    /// Follows the background agent this viewport is watching, one at a time (`WatchAgent`).
    agent_watch: Option<JoinHandle<()>>,
    /// This viewport's id, used to gate input/resize to the controller and to claim control.
    viewer_id: u64,
    /// On a paired device's link: where it can reach this computer without the relay.
    routes: Option<watch::Receiver<Vec<String>>>,
    /// On a paired device's link: which device it is.
    device: Option<String>,
    /// Whether the client's app is on screen, as far as it has said. A device is sent banners over
    /// this link only while it is; out of sight it is pushed them, if it takes those.
    attended: Arc<AtomicBool>,
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
            agent_watch: None,
            viewer_id,
            routes: None,
            device: None,
            attended: Arc::new(AtomicBool::new(true)),
        }
    }

    /// Tells the settings screen the remote settings as they are set: only what was overridden,
    /// next to what an empty field falls back to.
    fn send_remote_config(&self) {
        self.send(ServerMessage::RemoteConfig {
            config: crate::config::remote_overrides(),
            defaults: crate::config::remote_defaults(),
        });
    }

    /// Makes this a paired device's connection: it is told the direct routes when it says hello.
    pub fn set_device(&mut self, device: String, routes: watch::Receiver<Vec<String>>) {
        self.device = Some(device);
        self.routes = Some(routes);
    }

    /// The largest picture this client is sent to show. A device's link crosses the relay, which
    /// takes a message of a few megabytes at most, and the picture grows by a third in base64 and
    /// again in its encryption; the app on this computer has no such limit.
    fn image_limit(&self) -> u64 {
        if self.is_device() {
            DEVICE_IMAGE_LIMIT
        } else {
            LOCAL_IMAGE_LIMIT
        }
    }

    /// Whether the client is a paired device rather than the app on this computer.
    fn is_device(&self) -> bool {
        self.device.is_some()
    }

    /// Tells the push service whether this device's app is on screen and taking banners over this
    /// link: while it is, nothing is pushed to it.
    fn update_watching(&self) {
        let Some(device) = &self.device else {
            return;
        };
        let watching = self.notify_task.is_some() && self.attended.load(Ordering::Relaxed);
        self.hub
            .push()
            .set_watching(device, self.viewer_id, watching);
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
            ClientMessage::Hello {
                protocol,
                device_name,
                ..
            } => {
                // A hello starts a client from scratch. On a relay link a new device can take over
                // the daemon's standing socket, so whatever the last one had attached is dropped.
                self.reset_client();
                if protocol == PROTOCOL_VERSION {
                    self.link.set_protocol(protocol);
                    self.send(ServerMessage::Welcome {
                        protocol: PROTOCOL_VERSION,
                        version: crate::updates::current_version().to_string(),
                        host: Some(crate::system::host().clone()),
                    });
                    // A device learns here where else it can reach this computer; the routes
                    // task tells it of any change after this.
                    if let Some(routes) = &mut self.routes {
                        let routes = routes.borrow_and_update().clone();
                        self.send(ServerMessage::Routes { routes });
                        // And the relay it reaches this computer through, which it keeps.
                        let url = self.hub.subscribe_relay().borrow().clone();
                        if !url.is_empty() {
                            self.send(ServerMessage::Relay { url });
                        }
                    }
                    // A device says what it is called, and is listed under that name. Only a
                    // device's own link names it, and only itself.
                    if let (Some(device), Some(name)) = (
                        &self.device,
                        device_name
                            .as_deref()
                            .and_then(crate::pairing::device::device_label),
                    ) {
                        self.hub.name_device(device, &name);
                    }
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
            ClientMessage::ListConversations { workspace, query } => {
                // Reads the conversations' files (all of them, for a search): off the message loop.
                let hub = self.hub.clone();
                let out = self.out.clone();
                tokio::task::spawn_blocking(move || {
                    let conversations = hub.conversations(&workspace, query.as_deref());
                    let _ = out.send(ServerMessage::ConversationList {
                        workspace,
                        query,
                        conversations,
                    });
                });
            }
            ClientMessage::ResumeConversation {
                workspace,
                conversation,
                agent,
                account,
                mode,
            } => match self.hub.resume_conversation(
                &workspace,
                &conversation,
                agent,
                account,
                mode.unwrap_or(SessionMode::Chat),
            ) {
                Ok(session) => self.send(ServerMessage::SessionOpened { workspace, session }),
                Err(error) => self.send(ServerMessage::Error {
                    message: error.to_string(),
                }),
            },
            ClientMessage::ChatTurn {
                session,
                text,
                files,
            } => {
                // A chat turn is "input": only the controlling viewport may drive the agent.
                if self.hub.drives(self.viewer_id)
                    && let Some(chat) = self.hub.get_chat(&session)
                {
                    // A queue held by a stop follows this turn once it ends.
                    self.hub.resume_queue(&session);
                    tokio::spawn(async move { chat.send_turn(&text, &files).await });
                }
            }
            ClientMessage::ChatQueue {
                session,
                text,
                files,
            } => {
                if self.hub.drives(self.viewer_id) {
                    self.hub.queue_turn(&session, text, files);
                }
            }
            ClientMessage::ChatUnqueue { session, id, send } => {
                if self.hub.drives(self.viewer_id) {
                    self.hub.unqueue_turn(&session, &id, send);
                }
            }
            ClientMessage::ChatInterrupt { session } => {
                // Stop button: interrupt the running turn. Same control gate as a chat turn. What
                // is queued waits rather than going out as the stopped turn settles.
                if self.hub.drives(self.viewer_id)
                    && let Some(chat) = self.hub.get_chat(&session)
                {
                    self.hub.pause_queue(&session);
                    tokio::spawn(async move { chat.interrupt().await });
                }
            }
            ClientMessage::ChatApprovalResponse { session, id, allow } => {
                // Allow/deny a pending tool approval. Any viewport may answer, without taking
                // control: every one is shown the question (the phone in a banner, maybe while the
                // desktop holds control), and the first answer is the one taken; a later one finds
                // nothing pending. The controller answering counts as driving, as before.
                if self.hub.is_controller(self.viewer_id) {
                    self.hub.drives(self.viewer_id);
                }
                if let Some(chat) = self.hub.get_chat(&session) {
                    tokio::spawn(async move { chat.respond_approval(&id, allow).await });
                }
            }
            ClientMessage::ChatPermissionMode { session, mode } => {
                // The composer's permission dropdown: apply live and persist.
                if self.hub.drives(self.viewer_id) {
                    self.hub.set_permission_mode(&session, mode);
                }
            }
            ClientMessage::ChatSetModel {
                session,
                model,
                effort,
            } => {
                // The composer's model dropdown: apply live and persist.
                if self.hub.drives(self.viewer_id) {
                    self.hub.set_model(&session, model, effort);
                }
            }
            ClientMessage::ChatCommand { session, command } => {
                // The composer's context controls (/compact, /clear).
                if self.hub.drives(self.viewer_id) {
                    self.hub.run_chat_command(&session, command);
                }
            }
            ClientMessage::ChatLoadEarlier { session, loaded } => {
                // "Load earlier": send the page of messages just before what the viewport holds.
                if let Some(log) = self.chat_log(&session) {
                    let (events, has_more) = log.earlier(loaded as usize, CHAT_PAGE);
                    if !events.is_empty() {
                        self.send(ServerMessage::ChatHistory {
                            session,
                            events,
                            has_more,
                        });
                    }
                }
            }
            ClientMessage::ChatFetchFile {
                session,
                log,
                seq,
                index,
            } => {
                let file = self
                    .chat_log(&session)
                    .and_then(|chat| chat.file(&log, seq, index as usize));
                if let Some(file) = file {
                    self.send(ServerMessage::ChatFileData {
                        session,
                        log,
                        seq,
                        index,
                        file,
                    });
                }
            }
            ClientMessage::SwitchMode { session, mode } => {
                // Restarts the session in the other backend (resumes the same conversation).
                if self.hub.drives(self.viewer_id) {
                    self.hub.switch_mode(&session, mode);
                }
            }
            ClientMessage::SetSessionAgent {
                session,
                agent,
                account,
            } => {
                // Restarts the session under a different agent (fresh conversation). Gated by control.
                if self.hub.drives(self.viewer_id) {
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
                let file = self.hub.read_file(&workspace, &path, self.image_limit());
                self.send(ServerMessage::FileContent {
                    workspace,
                    path,
                    content: file.content,
                    truncated: file.truncated,
                    binary: file.binary,
                    image: file.image,
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
            ClientMessage::TrashPath { workspace, path } => {
                match self.hub.trash_path(&workspace, &path) {
                    Ok(()) => self.send(ServerMessage::PathTrashed { workspace, path }),
                    Err(error) => self.send(ServerMessage::Error {
                        message: format!("couldn't move {path} to the Trash: {error}"),
                    }),
                }
            }
            ClientMessage::OpenShell {
                workspace,
                shell,
                folder,
            } => {
                // Spawning a shell only makes it viewable; typing into it is still gated by `Input`,
                // so this isn't controller-gated. Surface a spawn failure instead of swallowing it.
                if let Err(error) =
                    self.hub
                        .open_shell(&workspace, &shell, &folder, self.device.clone())
                {
                    self.send(ServerMessage::Error {
                        message: format!("couldn't open terminal: {error}"),
                    });
                }
            }
            ClientMessage::RenameShell { shell, title } => self.hub.rename_shell(&shell, &title),
            ClientMessage::BrowseFolders { path } => {
                match crate::files::browse::browse(path.as_deref()) {
                    Ok(listing) => self.send(ServerMessage::FolderListing {
                        path: listing.path,
                        parent: listing.parent,
                        home: listing.home,
                        dirs: listing.dirs,
                        space_file: listing.space_file,
                    }),
                    Err(error) => self.send(ServerMessage::Error {
                        message: format!(
                            "couldn't open {}: {error}",
                            path.as_deref().unwrap_or("the home folder")
                        ),
                    }),
                }
            }
            ClientMessage::WatchAgent { session, agent } => {
                if let Some(task) = self.agent_watch.take() {
                    task.abort();
                }
                if let Some(agent) = agent {
                    self.agent_watch = Some(super::agent_log::follow(
                        self.hub.clone(),
                        self.out.clone(),
                        session,
                        agent,
                    ));
                }
            }
            ClientMessage::GitStatus { workspace, folder } => {
                let status = self.hub.git_status(&workspace, &folder);
                let repos = self.hub.git_repos(&workspace);
                self.send(ServerMessage::GitStatus {
                    workspace,
                    folder,
                    status,
                    repos,
                });
            }
            ClientMessage::GitDiff {
                workspace,
                folder,
                path,
                staged,
            } => {
                let (patch, truncated) = self.hub.git_diff(&workspace, &folder, &path, staged);
                self.send(ServerMessage::GitDiff {
                    workspace,
                    folder,
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
                    self.send_remote_config();
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
                            pairing.set_direct(resolved.direct);
                            self.send_remote_config();
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
            // banners while the user is looking at the app. That is about this computer's screen:
            // a paired device's own focus is its own business, and says nothing here.
            ClientMessage::SetFocused { focused } => {
                if self.is_device() {
                    self.attended.store(focused, Ordering::Relaxed);
                    self.update_watching();
                } else {
                    self.hub.set_focused(focused)
                }
            }
            ClientMessage::RegisterPush { token } => {
                if let Some(device) = &self.device {
                    self.hub.push().register(device, token);
                }
            }
            // The viewport shows banners itself: forward notifications to it as `Notify` messages.
            // For the Electron shell, the daemon skips the OS notifier while it stays subscribed.
            ClientMessage::NotificationsNative { enabled } => {
                self.set_notifications_native(enabled)
            }
            ClientMessage::Attach { session, chat } => self.attach(&session, chat),
            ClientMessage::Detach { session } => {
                if let Some(forwarder) = self.attached.remove(&session) {
                    forwarder.abort();
                }
            }
            ClientMessage::Input { session, data } => {
                // Only the controlling viewport drives the terminal.
                if self.hub.drives(self.viewer_id)
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
    /// notification broadcast and relays each banner to this viewport as a `Notify` message. On
    /// the local link the subscription's presence is what makes the controller route banners here,
    /// and aborting the task (here or on disconnect) drops it, so the daemon falls back to the OS
    /// notifier. A paired device is told beside the computer, never in its place.
    fn set_notifications_native(&mut self, enabled: bool) {
        if let Some(task) = self.notify_task.take() {
            task.abort();
        }
        if !enabled {
            self.update_watching();
            return;
        }
        let mut rx = self.hub.subscribe_notifications(self.is_device());
        let out = self.out.clone();
        let attended = self.attended.clone();
        // A device that takes pushed banners gets each one a single way: over this link while its
        // app is on screen, pushed otherwise. One that does not only has this link.
        let pushed = self.device.clone().map(|device| (self.hub.push(), device));
        self.notify_task = Some(tokio::spawn(async move {
            loop {
                match rx.recv().await {
                    Ok(banner) => {
                        let away = !attended.load(Ordering::Relaxed);
                        if away
                            && let Some((push, device)) = &pushed
                            && push.has_token(device)
                        {
                            continue;
                        }
                        if out
                            .send(ServerMessage::Notify {
                                title: banner.title,
                                body: banner.body,
                                workspace: Some(banner.workspace),
                                session: banner.session,
                                approval: banner.approval,
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
        self.update_watching();
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
        if let Some(task) = self.agent_watch.take() {
            task.abort();
        }
        self.slots.clear();
        if let Some(task) = self.notify_task.take() {
            task.abort();
        }
        // The next client on this link starts as any does: on screen until it says otherwise.
        self.attended.store(true, Ordering::Relaxed);
        self.update_watching();
        self.refused = false;
        self.link.reset();
    }

    /// A session's agent was started over while this viewport was following it. A chat is moved
    /// onto the new process at once and sent the conversation afresh: left alone, the viewport
    /// would go on listening to the old one, and show nothing of what is said from then on. A
    /// terminal is left to its viewport, which clears its screen before it attaches again.
    pub fn session_restarted(&mut self, session_id: &str) {
        if self.attached.contains_key(session_id) && self.hub.get_chat(session_id).is_some() {
            self.attach(session_id, None);
        }
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

    /// A session's chat log, whichever kind of session it is.
    fn chat_log(&self, session_id: &str) -> Option<Arc<ChatLog>> {
        if let Some(session) = self.hub.get(session_id) {
            return Some(session.chat_log().clone());
        }
        self.hub
            .get_chat(session_id)
            .map(|chat| chat.chat_log().clone())
    }

    /// Replays a session's current state, then streams it. Re-attaching replaces the prior
    /// forwarder, so nothing is streamed twice for one session on one connection. `cursor` is how
    /// much of the session's chat the viewport says it still holds.
    fn attach(&mut self, session_id: &str, cursor: Option<ChatCursor>) {
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
                let _ = forward_pty(out, id, session, slot, cursor).await;
            })
        } else if let Some(chat) = self.hub.get_chat(session_id) {
            tokio::spawn(async move {
                let _ = forward_chat(out, id, chat, cursor).await;
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
    session: String,
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

    /// Tells the viewport the terminal's size. Sent ahead of output drawn for that size.
    async fn size(&self, cols: u16, rows: u16) -> Result<(), Closed> {
        self.out
            .stream_message(ServerMessage::TerminalSize {
                session: self.session.clone(),
                cols,
                rows,
            })
            .await
    }

    /// Wipes the viewport's terminal (`ESC c`) and redraws it as it stands, at its size: on attach,
    /// and again whenever the viewport fell too far behind to catch up chunk by chunk.
    async fn repaint(&self, snapshot: Snapshot) -> Result<(), Closed> {
        self.size(snapshot.cols, snapshot.rows).await?;
        self.write(format!("\u{1b}c{}", snapshot.repaint)).await
    }
}

/// Streams a PTY terminal to one viewport: the slot its output is tagged with, its size, the screen
/// as it stands and its status, then output, changes of size, status and transcript events as they
/// happen. Output is merged over [`OUTPUT_WINDOW`], and every send waits for room in the
/// connection's queue; a viewport slow enough to miss output is repainted as the terminal stands
/// instead of being sent a backlog it will never catch up on.
async fn forward_pty(
    out: Outbound,
    id: String,
    session: Arc<Session>,
    slot: u16,
    cursor: Option<ChatCursor>,
) -> Result<(), Closed> {
    out.stream_message(ServerMessage::Attached {
        session: id.clone(),
        slot,
    })
    .await?;
    let sink = TerminalSink {
        out: out.clone(),
        session: id.clone(),
        slot,
    };
    let (snapshot, mut output_rx) = session.attach_output();
    sink.repaint(snapshot).await?;

    let mut status_rx = session.subscribe_status();
    let mut last_status = *status_rx.borrow_and_update();
    send_status(&out, &id, last_status).await?;

    // Bring the chat view level with the transcript. A session with no transcript (non-Claude, or
    // before its first hook) gets a reset and no events, so the viewport falls back to the terminal.
    let chat_log = session.chat_log().clone();
    let mut chat = ChatFeed::start(&out, &id, &chat_log, cursor.as_ref()).await?;

    let mut output = Coalescer::new(OUTPUT_WINDOW, OUTPUT_MAX_BATCH);
    loop {
        tokio::select! {
            chunk = output_rx.recv() => match chunk {
                Ok(Output::Data(data)) => {
                    if let Some(text) = output.push(&data, Instant::now()) {
                        sink.write(text).await?;
                    }
                }
                Ok(Output::Resized { cols, rows }) => {
                    // Output still held was drawn for the old size, so it goes first.
                    if let Some(text) = output.take(Instant::now()) {
                        sink.write(text).await?;
                    }
                    sink.size(cols, rows).await?;
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
            frame = chat.rx.recv() => {
                if chat.forward(&out, &id, &chat_log, frame).await? == Fed::Closed {
                    break;
                }
            }
        }
    }
    Ok(())
}

/// Streams a headless chat session to one viewport: its status, the recent transcript, the reply in
/// progress, pending approvals and slash commands, then each as it changes. Streaming text is sent
/// as the new piece only, merged over [`DELTA_WINDOW`]; a viewport that falls behind is re-synced
/// from the session's current state rather than replayed.
async fn forward_chat(
    out: Outbound,
    id: String,
    chat: Arc<ChatSession>,
    cursor: Option<ChatCursor>,
) -> Result<(), Closed> {
    let mut status_rx = chat.subscribe_status();
    let mut last_status = *status_rx.borrow_and_update();
    send_status(&out, &id, last_status).await?;

    let chat_log = chat.chat_log().clone();
    let mut approval_rx = chat.subscribe_approval();
    let mut resolved_rx = chat.subscribe_resolved();
    let mut feed = ChatFeed::start(&out, &id, &chat_log, cursor.as_ref()).await?;
    send_approvals(&out, &id, &chat).await?;
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
            frame = feed.rx.recv() => match feed.forward(&out, &id, &chat_log, frame).await? {
                Fed::Event => {}
                // The view was caught up or started over, which drops the approvals and streaming
                // text it held: send both again as they stand.
                Fed::Resynced => {
                    send_approvals(&out, &id, &chat).await?;
                    delta.clear();
                    delta_rx = send_delta_snapshot(&out, &id, &chat, true).await?;
                }
                Fed::Closed => break,
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

/// What forwarding one frame of a chat log came to.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum Fed {
    /// An event went out (or was one the viewport already has).
    Event,
    /// The viewport was brought level again, by a catch-up or by starting over.
    Resynced,
    /// The log is gone.
    Closed,
}

/// One viewport's place in a chat log: the feed of what comes next, and how far it has been sent.
struct ChatFeed {
    rx: broadcast::Receiver<LogFrame>,
    /// The run of the log the viewport is following, and the last event of it that was sent.
    sent: ChatCursor,
}

impl ChatFeed {
    /// Brings a viewport level with a chat log, given how much of it the viewport says it holds,
    /// and returns its feed. A viewport whose cursor still lines up keeps what it has and is sent
    /// the events after it; any other starts over from the most recent page (it pages back with
    /// `ChatLoadEarlier`, so a long transcript doesn't flood the wire).
    async fn start(
        out: &Outbound,
        id: &str,
        log: &ChatLog,
        cursor: Option<&ChatCursor>,
    ) -> Result<ChatFeed, Closed> {
        let (start, rx) = log.attach(cursor, CHAT_PAGE);
        let sent = match start {
            Start::Resume { events, seq } => {
                out.stream_message(ServerMessage::ChatResumed {
                    session: id.to_string(),
                })
                .await?;
                if !events.is_empty() {
                    out.stream_message(ServerMessage::Chat {
                        session: id.to_string(),
                        events,
                        seq,
                    })
                    .await?;
                }
                ChatCursor {
                    // A resume is only ever offered for the log the cursor named.
                    log: cursor.map(|cursor| cursor.log.clone()).unwrap_or_default(),
                    seq,
                }
            }
            Start::Reset {
                log,
                seq,
                tail,
                has_more,
            } => {
                out.stream_message(ServerMessage::ChatReset {
                    session: id.to_string(),
                    log: log.clone(),
                    seq,
                })
                .await?;
                if !tail.is_empty() || has_more {
                    out.stream_message(ServerMessage::ChatHistory {
                        session: id.to_string(),
                        events: tail,
                        has_more,
                    })
                    .await?;
                }
                ChatCursor { log, seq }
            }
        };
        Ok(ChatFeed { rx, sent })
    }

    /// Sends on one frame of the feed. A viewport that missed frames is caught up from where it
    /// was, or started over if that is too far back; one whose log started over starts over too.
    async fn forward(
        &mut self,
        out: &Outbound,
        id: &str,
        log: &ChatLog,
        frame: Result<LogFrame, broadcast::error::RecvError>,
    ) -> Result<Fed, Closed> {
        match frame {
            Ok(LogFrame::Event { seq, event }) => {
                if seq > self.sent.seq {
                    self.sent.seq = seq;
                    out.stream_message(ServerMessage::Chat {
                        session: id.to_string(),
                        events: vec![event],
                        seq,
                    })
                    .await?;
                }
                Ok(Fed::Event)
            }
            Ok(LogFrame::Restarted) => {
                *self = ChatFeed::start(out, id, log, None).await?;
                Ok(Fed::Resynced)
            }
            Err(broadcast::error::RecvError::Lagged(_)) => {
                let held = self.sent.clone();
                *self = ChatFeed::start(out, id, log, Some(&held)).await?;
                Ok(Fed::Resynced)
            }
            Err(broadcast::error::RecvError::Closed) => Ok(Fed::Closed),
        }
    }
}

/// Sends the tool approvals still awaiting an answer.
async fn send_approvals(out: &Outbound, id: &str, chat: &ChatSession) -> Result<(), Closed> {
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
        if let Some(task) = self.agent_watch.take() {
            task.abort();
        }
        self.update_watching();
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

    fn says(text: &str) -> ChatEvent {
        ChatEvent::Assistant { text: text.into() }
    }

    /// The messages waiting in a queue, each reduced to its kind and what matters about it.
    fn drain(rx: &mut mpsc::Receiver<Frame>) -> Vec<String> {
        let mut seen = Vec::new();
        while let Ok(frame) = rx.try_recv() {
            seen.push(match frame {
                Frame::Message(ServerMessage::ChatReset { seq, .. }) => format!("reset@{seq}"),
                Frame::Message(ServerMessage::ChatResumed { .. }) => "resumed".to_string(),
                Frame::Message(ServerMessage::ChatHistory {
                    events, has_more, ..
                }) => format!("history x{} more={has_more}", events.len()),
                Frame::Message(ServerMessage::Chat { events, seq, .. }) => {
                    format!("chat x{} @{seq}", events.len())
                }
                other => format!("{other:?}"),
            });
        }
        seen
    }

    #[tokio::test]
    async fn a_new_viewport_gets_the_last_page_then_each_event_numbered() {
        let log = ChatLog::new((0..CHAT_PAGE + 5).map(|n| says(&n.to_string())).collect());
        let (out, mut rx, _stalled) = Outbound::channel();
        let last = (CHAT_PAGE + 5) as u32;

        let mut feed = ChatFeed::start(&out, "s1", &log, None).await.unwrap();
        assert_eq!(
            drain(&mut rx),
            [
                format!("reset@{last}"),
                format!("history x{CHAT_PAGE} more=true")
            ]
        );

        log.push(says("new"));
        let frame = feed.rx.recv().await;
        assert_eq!(feed.forward(&out, "s1", &log, frame).await, Ok(Fed::Event));
        assert_eq!(drain(&mut rx), [format!("chat x1 @{}", last + 1)]);
        assert_eq!(feed.sent.seq, last + 1);
    }

    #[tokio::test]
    async fn a_returning_viewport_keeps_its_chat_and_gets_what_it_missed() {
        let log = ChatLog::new(vec![says("1"), says("2")]);
        let (out, mut rx, _stalled) = Outbound::channel();
        let first = ChatFeed::start(&out, "s1", &log, None).await.unwrap();
        drain(&mut rx);

        // The viewport goes away holding two events; three more are said meanwhile.
        let held = first.sent.clone();
        drop(first);
        log.extend(vec![says("3"), says("4"), says("5")]);

        let feed = ChatFeed::start(&out, "s1", &log, Some(&held))
            .await
            .unwrap();
        assert_eq!(drain(&mut rx), ["resumed", "chat x3 @5"]);
        assert_eq!(feed.sent, ChatCursor { seq: 5, ..held });

        // Coming back level sends nothing but the acknowledgement.
        let level = feed.sent.clone();
        ChatFeed::start(&out, "s1", &log, Some(&level))
            .await
            .unwrap();
        assert_eq!(drain(&mut rx), ["resumed"]);
    }

    #[tokio::test]
    async fn a_viewport_with_a_stale_cursor_starts_over() {
        let log = ChatLog::new(vec![says("1")]);
        let (out, mut rx, _stalled) = Outbound::channel();

        // A cursor into a log the daemon no longer has (it restarted, or the conversation did).
        let stale = ChatCursor {
            log: "gone".into(),
            seq: 1,
        };
        ChatFeed::start(&out, "s1", &log, Some(&stale))
            .await
            .unwrap();
        assert_eq!(drain(&mut rx), ["reset@1", "history x1 more=false"]);

        // An empty log still resets, so the viewport drops what it held and shows no chat.
        let empty = ChatLog::new(Vec::new());
        ChatFeed::start(&out, "s1", &empty, Some(&stale))
            .await
            .unwrap();
        assert_eq!(drain(&mut rx), ["reset@0"]);
    }

    #[tokio::test]
    async fn a_log_that_starts_over_resets_the_viewport() {
        let log = ChatLog::new(vec![says("1"), says("2")]);
        let (out, mut rx, _stalled) = Outbound::channel();
        let mut feed = ChatFeed::start(&out, "s1", &log, None).await.unwrap();
        let before = feed.sent.log.clone();
        drain(&mut rx);

        log.restart();
        log.push(says("fresh"));
        let frame = feed.rx.recv().await;
        assert_eq!(
            feed.forward(&out, "s1", &log, frame).await,
            Ok(Fed::Resynced)
        );
        // The event said after the restart is in the page that follows the reset, once.
        assert_eq!(drain(&mut rx), ["reset@1", "history x1 more=false"]);
        assert_ne!(feed.sent.log, before);
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
        tokio::spawn(forward_chat(out, "s1".to_string(), chat.clone(), None));

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
        tokio::spawn(forward_chat(out, "s1".to_string(), chat.clone(), None));

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
