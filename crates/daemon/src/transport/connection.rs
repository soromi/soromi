use std::collections::HashMap;
use std::sync::Arc;

use soromi_protocol::{ClientMessage, ServerMessage};
use tokio::sync::{broadcast, mpsc};
use tokio::task::JoinHandle;

use crate::accounts::store::FileAccountManager;
use crate::workspaces::service::{CreateSpaceInput, WorkspaceService};

pub type Outbound = mpsc::UnboundedSender<ServerMessage>;

/// Per-connection message routing. A viewport lists and opens workspaces, attaches to one,
/// then its input/resize drives that session while output and status stream back. Owns the
/// attach forwarders so they can be replaced on re-attach and cancelled on disconnect.
pub struct Connection {
    hub: Arc<WorkspaceService>,
    accounts: Arc<FileAccountManager>,
    out: Outbound,
    attached: HashMap<String, JoinHandle<()>>,
}

impl Connection {
    pub fn new(
        hub: Arc<WorkspaceService>,
        accounts: Arc<FileAccountManager>,
        out: Outbound,
    ) -> Self {
        Self {
            hub,
            accounts,
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
            ClientMessage::ExportSpace { workspace } => match self.hub.export_space(&workspace) {
                Ok(path) => self.send(ServerMessage::SpaceExported { workspace, path }),
                Err(error) => self.send(ServerMessage::Error {
                    message: error.to_string(),
                }),
            },
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
            ClientMessage::ListAccounts => self.send_accounts(),
            ClientMessage::SaveAccount { profile } => {
                let _ = self.accounts.save(&profile);
                self.send_accounts();
            }
            ClientMessage::DeleteAccount { name } => {
                let _ = self.accounts.remove(&name);
                self.send_accounts();
            }
            ClientMessage::Attach { workspace } => self.attach(&workspace),
            ClientMessage::Input { workspace, data } => {
                if let Some(session) = self.hub.get(&workspace) {
                    session.write(&data);
                }
            }
            ClientMessage::Resize {
                workspace,
                cols,
                rows,
            } => {
                if let Some(session) = self.hub.get(&workspace) {
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
    /// prior forwarder, so output is never streamed twice for one workspace on one connection.
    /// The snapshot is prefixed with a terminal reset (`ESC c`) so a re-attach (reconnect) wipes
    /// the old content instead of writing on top of it.
    fn attach(&mut self, workspace: &str) {
        let Some(session) = self.hub.get(workspace) else {
            return;
        };
        if let Some(previous) = self.attached.remove(workspace) {
            previous.abort();
        }

        self.send(ServerMessage::Output {
            workspace: workspace.to_string(),
            data: format!("\u{1b}c{}", session.snapshot()),
        });
        self.send(ServerMessage::Status {
            workspace: workspace.to_string(),
            status: session.status(),
        });

        let out = self.out.clone();
        let name = workspace.to_string();
        let mut output_rx = session.subscribe_output();
        let mut status_rx = session.subscribe_status();
        let handle = tokio::spawn(async move {
            loop {
                tokio::select! {
                    output = output_rx.recv() => match output {
                        Ok(data) => {
                            let _ = out.send(ServerMessage::Output { workspace: name.clone(), data });
                        }
                        Err(broadcast::error::RecvError::Lagged(_)) => continue,
                        Err(broadcast::error::RecvError::Closed) => break,
                    },
                    changed = status_rx.changed() => {
                        if changed.is_err() {
                            break;
                        }
                        let status = *status_rx.borrow_and_update();
                        let _ = out.send(ServerMessage::Status { workspace: name.clone(), status });
                    }
                }
            }
        });
        self.attached.insert(workspace.to_string(), handle);
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
}
