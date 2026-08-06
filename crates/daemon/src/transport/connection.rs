use std::collections::HashMap;
use std::sync::Arc;

use soromi_protocol::{ClientMessage, ServerMessage};
use tokio::sync::{broadcast, mpsc};
use tokio::task::JoinHandle;

use crate::accounts::store::FileAccountManager;
use crate::pairing::PairingService;
use crate::sessions::session::Session;
use crate::sessions::stream_json::StreamJsonSession;
use crate::workspaces::service::{CreateSpaceInput, WorkspaceService};

/// Chat messages sent per page: the recent tail on attach, and each "Load earlier" step.
const CHAT_PAGE: usize = 80;

pub type Outbound = mpsc::UnboundedSender<ServerMessage>;

/// Per-connection message routing. A viewport lists and opens workspaces, attaches to one,
/// then its input/resize drives that session while output and status stream back. Owns the
/// attach forwarders so they can be replaced on re-attach and cancelled on disconnect.
pub struct Connection {
    hub: Arc<WorkspaceService>,
    accounts: Arc<FileAccountManager>,
    /// Present only on the trusted local link; device management is refused without it.
    pairing: Option<Arc<PairingService>>,
    out: Outbound,
    attached: HashMap<String, JoinHandle<()>>,
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
        viewer_id: u64,
    ) -> Self {
        Self {
            hub,
            accounts,
            pairing,
            out,
            attached: HashMap::new(),
            notify_task: None,
            viewer_id,
        }
    }

    pub fn handle(&mut self, message: ClientMessage) {
        match message {
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
            ClientMessage::ChatApprovalResponse {
                session,
                id,
                allow,
            } => {
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
            ClientMessage::ListSkills { session } => {
                let skills = self.hub.list_skills(&session);
                self.send(ServerMessage::SkillList { session, skills });
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
                // Local-link only, like device management: the relay/web URLs are a host setting.
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
                                resolved.web_url.clone(),
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
            ClientMessage::NotificationsNative { enabled } => self.set_notifications_native(enabled),
            ClientMessage::Attach { session } => self.attach(&session),
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

    /// Replays scrollback and current status, then streams both. Re-attaching replaces the
    /// prior forwarder, so output is never streamed twice for one session on one connection.
    /// The snapshot is prefixed with a terminal reset (`ESC c`) so a re-attach (reconnect) wipes
    /// the old content instead of writing on top of it.
    fn attach(&mut self, session_id: &str) {
        if let Some(previous) = self.attached.remove(session_id) {
            previous.abort();
        }
        // A tab is either a PTY terminal or a headless chat; attach whichever exists.
        if let Some(session) = self.hub.get(session_id) {
            self.attach_pty(session_id, &session);
        } else if let Some(chat) = self.hub.get_chat(session_id) {
            self.attach_chat(session_id, &chat);
        }
    }

    /// Replays scrollback + status for a PTY terminal, then streams output/status/chat.
    fn attach_pty(&mut self, session_id: &str, session: &Session) {
        self.send(ServerMessage::Output {
            session: session_id.to_string(),
            data: format!("\u{1b}c{}", session.snapshot()),
        });
        self.send(ServerMessage::Status {
            session: session_id.to_string(),
            status: session.status(),
        });
        // Reset the chat view, then replay the transcript so far. A session with no transcript
        // (non-Claude, or before its first hook) sends the reset and no events, so the viewport
        // falls back to the terminal.
        self.send(ServerMessage::ChatReset {
            session: session_id.to_string(),
        });
        let chat = session.chat_snapshot();
        if !chat.is_empty() {
            self.send(ServerMessage::Chat {
                session: session_id.to_string(),
                events: chat,
            });
        }

        let out = self.out.clone();
        let id = session_id.to_string();
        let mut output_rx = session.subscribe_output();
        let mut status_rx = session.subscribe_status();
        let mut chat_rx = session.subscribe_chat();
        let handle = tokio::spawn(async move {
            loop {
                tokio::select! {
                    output = output_rx.recv() => match output {
                        Ok(data) => {
                            let _ = out.send(ServerMessage::Output { session: id.clone(), data });
                        }
                        Err(broadcast::error::RecvError::Lagged(_)) => continue,
                        Err(broadcast::error::RecvError::Closed) => break,
                    },
                    changed = status_rx.changed() => {
                        if changed.is_err() {
                            break;
                        }
                        let status = *status_rx.borrow_and_update();
                        let _ = out.send(ServerMessage::Status { session: id.clone(), status });
                    }
                    event = chat_rx.recv() => match event {
                        Ok(event) => {
                            let _ = out.send(ServerMessage::Chat {
                                session: id.clone(),
                                events: vec![event],
                            });
                        }
                        Err(broadcast::error::RecvError::Lagged(_)) => continue,
                        Err(broadcast::error::RecvError::Closed) => break,
                    },
                }
            }
        });
        self.attached.insert(session_id.to_string(), handle);
    }

    /// Attaches a headless chat session: sends its status + transcript-so-far, then streams status and
    /// new chat events. No terminal output/scrollback - the chat view renders from the events.
    fn attach_chat(&mut self, session_id: &str, session: &StreamJsonSession) {
        self.send(ServerMessage::Status {
            session: session_id.to_string(),
            status: session.status(),
        });
        self.send(ServerMessage::ChatReset {
            session: session_id.to_string(),
        });
        // Only the recent tail, so a long transcript doesn't flood the wire / balloon the webview; the
        // viewport pages back with `ChatLoadEarlier`.
        let (tail, has_more) = session.chat_tail(CHAT_PAGE);
        if !tail.is_empty() || has_more {
            self.send(ServerMessage::ChatHistory {
                session: session_id.to_string(),
                events: tail,
                has_more,
            });
        }
        // A viewer joining mid-turn should see the in-progress reply.
        let delta = session.delta_snapshot();
        if !delta.is_empty() {
            self.send(ServerMessage::ChatDelta {
                session: session_id.to_string(),
                text: delta,
            });
        }
        // ...and any tool approvals still awaiting an answer.
        for approval in session.approval_snapshot() {
            self.send(ServerMessage::ChatApproval {
                session: session_id.to_string(),
                approval,
            });
        }

        let out = self.out.clone();
        let id = session_id.to_string();
        let mut status_rx = session.subscribe_status();
        let mut chat_rx = session.subscribe_chat();
        let mut delta_rx = session.subscribe_delta();
        let mut approval_rx = session.subscribe_approval();
        let mut resolved_rx = session.subscribe_resolved();
        let handle = tokio::spawn(async move {
            loop {
                tokio::select! {
                    changed = status_rx.changed() => {
                        if changed.is_err() { break }
                        let status = *status_rx.borrow_and_update();
                        let _ = out.send(ServerMessage::Status { session: id.clone(), status });
                    }
                    event = chat_rx.recv() => match event {
                        Ok(event) => {
                            let _ = out.send(ServerMessage::Chat {
                                session: id.clone(),
                                events: vec![event],
                            });
                        }
                        Err(broadcast::error::RecvError::Lagged(_)) => continue,
                        Err(broadcast::error::RecvError::Closed) => break,
                    },
                    delta = delta_rx.recv() => match delta {
                        Ok(text) => {
                            let _ = out.send(ServerMessage::ChatDelta { session: id.clone(), text });
                        }
                        Err(broadcast::error::RecvError::Lagged(_)) => continue,
                        Err(broadcast::error::RecvError::Closed) => break,
                    },
                    approval = approval_rx.recv() => match approval {
                        Ok(approval) => {
                            let _ = out.send(ServerMessage::ChatApproval { session: id.clone(), approval });
                        }
                        Err(broadcast::error::RecvError::Lagged(_)) => continue,
                        Err(broadcast::error::RecvError::Closed) => break,
                    },
                    resolved = resolved_rx.recv() => match resolved {
                        Ok(approval_id) => {
                            let _ = out.send(ServerMessage::ChatApprovalResolved { session: id.clone(), id: approval_id });
                        }
                        Err(broadcast::error::RecvError::Lagged(_)) => continue,
                        Err(broadcast::error::RecvError::Closed) => break,
                    },
                }
            }
        });
        self.attached.insert(session_id.to_string(), handle);
    }
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

/// Sends the current workspace list and keep-awake state.
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
