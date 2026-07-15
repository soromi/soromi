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
}

impl Connection {
    pub fn new(
        hub: Arc<WorkspaceService>,
        accounts: Arc<FileAccountManager>,
        pairing: Option<Arc<PairingService>>,
        out: Outbound,
    ) -> Self {
        Self {
            hub,
            accounts,
            pairing,
            out,
            attached: HashMap::new(),
        }
    }

    pub fn handle(&mut self, message: ClientMessage) {
        match message {
            ClientMessage::ListWorkspaces => send_state(&self.hub, &self.out),
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
                            // Apply live so new pairings + existing dials use the new relay.
                            pairing.set_urls(resolved.relay_url.clone(), resolved.web_url.clone());
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
            ClientMessage::Attach { session } => self.attach(&session),
            ClientMessage::Input { session, data } => {
                if let Some(session) = self.hub.get(&session) {
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
                if let Some(session) = self.hub.get(&session) {
                    session.resize(cols, rows);
                }
            }
        }
    }

    pub fn dispose(&mut self) {
        for (_, handle) in self.attached.drain() {
            handle.abort();
        }
    }

    fn send(&self, message: ServerMessage) {
        let _ = self.out.send(message);
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
