use std::collections::HashMap;
use std::sync::Arc;

use soromi_protocol::{ClientMessage, ServerMessage};
use tokio::sync::{broadcast, mpsc};
use tokio::task::JoinHandle;

use crate::accounts::store::FileAccountManager;
use crate::pairing::PairingService;
use crate::workspaces::service::{CreateSpaceInput, WorkspaceService};

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
            } => match self.hub.open_session(&workspace, agent, account) {
                Ok(session) => self.send(ServerMessage::SessionOpened { workspace, session }),
                Err(error) => self.send(ServerMessage::Error {
                    message: error.to_string(),
                }),
            },
            ClientMessage::CloseSession { session } => self.hub.close_session(&session),
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
        let Some(session) = self.hub.get(session_id) else {
            return;
        };
        if let Some(previous) = self.attached.remove(session_id) {
            previous.abort();
        }

        self.send(ServerMessage::Output {
            session: session_id.to_string(),
            data: format!("\u{1b}c{}", session.snapshot()),
        });
        self.send(ServerMessage::Status {
            session: session_id.to_string(),
            status: session.status(),
        });

        let out = self.out.clone();
        let id = session_id.to_string();
        let mut output_rx = session.subscribe_output();
        let mut status_rx = session.subscribe_status();
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
