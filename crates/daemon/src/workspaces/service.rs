use std::fs;
use std::path::Path;
use std::sync::{Arc, Mutex};

use soromi_protocol::{DirEntry, KeepAwakeMode, Status, WorkspaceSummary};
use tokio::sync::broadcast;

use crate::accounts::loader::{accounts_dir, load_account_profile};
use crate::accounts::resolver::resolve_launch_env;
use crate::files::directory::list_directory;
use crate::files::reader::{read_file_within, FileRead};
use crate::keep_awake::controller::KeepAwakeController;
use crate::notifications::controller::NotificationController;
use crate::sessions::manager::SessionManager;
use crate::sessions::session::{Session, SessionOptions};
use crate::workspaces::agent_command::parse_agent_command;
use crate::workspaces::config::{PersistedSpace, Workspace, WorkspaceDefaults};
use crate::workspaces::space_store::{load_spaces, save_spaces};
use crate::workspaces::workspace_loader::load_workspace;

struct WorkspaceMeta {
    agent: String,
    account: String,
    folders: Vec<String>,
    root: String,
    defaults: Option<WorkspaceDefaults>,
}

pub struct CreateSpaceInput {
    pub name: String,
    pub root: String,
    pub agent: String,
    pub account: String,
    pub folders: Option<Vec<String>>,
}

pub struct OpenResult {
    pub workspace: String,
    pub warning: Option<String>,
}

/// Creates and owns spaces. Spaces are created in-app and persisted under `~/.soromi/`, so
/// they restore when the daemon restarts. `open_workspace` imports an optional
/// `soromi.space.json`. A missing account profile is non-fatal (runs under the base env with a
/// warning). Interior-mutable and `Arc`-shared across connections.
pub struct WorkspaceService {
    manager: SessionManager,
    metadata: Mutex<Vec<(String, WorkspaceMeta)>>,
    notifications: Arc<NotificationController>,
    keep_awake: Arc<KeepAwakeController>,
    change_tx: broadcast::Sender<()>,
}

impl WorkspaceService {
    /// Must be called within a tokio runtime: restoring spaces spawns their status watchers.
    pub fn new(
        notifications: Arc<NotificationController>,
        keep_awake: Arc<KeepAwakeController>,
    ) -> Arc<Self> {
        let (change_tx, _) = broadcast::channel(64);
        let service = Arc::new(Self {
            manager: SessionManager::new(),
            metadata: Mutex::new(Vec::new()),
            notifications,
            keep_awake,
            change_tx,
        });
        let mut pruned_any = false;
        for mut space in load_spaces() {
            let kept = existing_folders(&space.root, &space.folders);
            if kept != space.folders {
                pruned_any = true;
                space.folders = kept;
            }
            service.spawn_space(space);
        }
        // Persist once if any space had folders that no longer exist on disk.
        if pruned_any {
            service.persist();
        }
        service
    }

    pub fn subscribe_changes(&self) -> broadcast::Receiver<()> {
        self.change_tx.subscribe()
    }

    pub fn create_space(&self, input: CreateSpaceInput) -> anyhow::Result<OpenResult> {
        if self.has(&input.name) {
            return Ok(OpenResult {
                workspace: input.name,
                warning: None,
            });
        }
        if !Path::new(&input.root).is_dir() {
            anyhow::bail!("folder not found: {}", input.root);
        }

        let folders = match input.folders {
            Some(folders) if !folders.is_empty() => folders,
            _ => vec![".".to_string()],
        };
        let warning = self.spawn_space(PersistedSpace {
            name: input.name.clone(),
            folders,
            agent: input.agent,
            account: input.account,
            defaults: None,
            root: input.root,
        });
        self.persist();
        self.emit_change();
        Ok(OpenResult {
            workspace: input.name,
            warning,
        })
    }

    pub fn open_workspace(&self, dir: &str) -> anyhow::Result<OpenResult> {
        let loaded = load_workspace(dir)?;
        self.create_space(CreateSpaceInput {
            name: loaded.workspace.name,
            root: loaded.root,
            agent: loaded.workspace.agent,
            account: loaded.workspace.account,
            folders: Some(loaded.workspace.folders),
        })
    }

    pub fn remove_space(&self, name: &str) {
        if !self.has(name) {
            return;
        }
        self.manager.dispose(name);
        self.metadata.lock().unwrap().retain(|(n, _)| n != name);
        self.persist();
        self.emit_change();
    }

    pub fn get(&self, name: &str) -> Option<Arc<Session>> {
        self.manager.get(name)
    }

    pub fn names(&self) -> Vec<String> {
        self.manager.names()
    }

    pub fn summaries(&self) -> Vec<WorkspaceSummary> {
        let metadata = self.metadata.lock().unwrap();
        metadata
            .iter()
            .map(|(name, meta)| WorkspaceSummary {
                name: name.clone(),
                status: self
                    .manager
                    .get(name)
                    .map(|s| s.status())
                    .unwrap_or(Status::Idle),
                agent: meta.agent.clone(),
                account: meta.account.clone(),
                folders: meta.folders.clone(),
            })
            .collect()
    }

    pub fn list_dir(&self, workspace: &str, path: &str) -> Vec<DirEntry> {
        let metadata = self.metadata.lock().unwrap();
        match metadata.iter().find(|(name, _)| name == workspace) {
            Some((_, meta)) => list_directory(Path::new(&meta.root), &meta.folders, path),
            None => Vec::new(),
        }
    }

    pub fn read_file(&self, workspace: &str, path: &str) -> FileRead {
        let metadata = self.metadata.lock().unwrap();
        match metadata.iter().find(|(name, _)| name == workspace) {
            Some((_, meta)) => read_file_within(Path::new(&meta.root), path),
            None => FileRead {
                content: String::new(),
                truncated: false,
                binary: false,
            },
        }
    }

    /// Writes the space's committable config to `<root>/soromi.space.json`. Returns the path.
    pub fn export_space(&self, workspace: &str) -> anyhow::Result<String> {
        let metadata = self.metadata.lock().unwrap();
        let (_, meta) = metadata
            .iter()
            .find(|(name, _)| name == workspace)
            .ok_or_else(|| anyhow::anyhow!("workspace not found: {workspace}"))?;
        let config = Workspace {
            name: workspace.to_string(),
            folders: meta.folders.clone(),
            agent: meta.agent.clone(),
            account: meta.account.clone(),
            defaults: meta.defaults.clone(),
        };
        let path = Path::new(&meta.root).join("soromi.space.json");
        let json = serde_json::to_string_pretty(&config)?;
        fs::write(&path, format!("{json}\n"))?;
        Ok(path.to_string_lossy().into_owned())
    }

    pub fn keep_awake_active(&self) -> bool {
        self.keep_awake.is_active()
    }

    pub fn keep_awake_mode(&self) -> KeepAwakeMode {
        self.keep_awake.mode()
    }

    pub fn set_keep_awake_mode(&self, mode: KeepAwakeMode) {
        self.keep_awake.set_mode(mode);
        self.emit_change();
    }

    pub fn set_muted(&self, workspace: &str, muted: bool) {
        self.notifications.set_muted(workspace, muted);
    }

    pub fn dispose(&self) {
        self.manager.dispose_all();
        self.metadata.lock().unwrap().clear();
    }

    fn has(&self, name: &str) -> bool {
        self.metadata.lock().unwrap().iter().any(|(n, _)| n == name)
    }

    /// Spawns a session for a space, wires its status watcher, and records its metadata.
    fn spawn_space(&self, space: PersistedSpace) -> Option<String> {
        let parsed = match parse_agent_command(&space.agent) {
            Ok(parsed) => parsed,
            Err(_) => return Some(format!("agent command for \"{}\" is empty", space.name)),
        };

        let base_env: Vec<(String, String)> = std::env::vars().collect();
        let mut env = base_env.clone();
        let mut warning = None;
        match load_account_profile(&space.account, &accounts_dir()) {
            Ok(profile) => {
                let resolved = resolve_launch_env(&profile, basename(&parsed.command), &base_env);
                for dir in &resolved.ensure_dirs {
                    let _ = fs::create_dir_all(dir);
                }
                env = resolved.env;
            }
            Err(_) => {
                warning = Some(format!(
                    "account \"{}\" is not configured; running under the default environment",
                    space.account
                ));
            }
        }

        let options = SessionOptions {
            command: parsed.command,
            args: parsed.args,
            cwd: space.root.clone(),
            env: Some(env),
            cols: 80,
            rows: 24,
        };
        if let Ok(session) = self.manager.ensure(&space.name, options) {
            self.watch_status(&space.name, &session);
        }

        self.metadata.lock().unwrap().push((
            space.name,
            WorkspaceMeta {
                agent: space.agent,
                account: space.account,
                folders: space.folders,
                root: space.root,
                defaults: space.defaults,
            },
        ));
        warning
    }

    /// Forwards a session's status changes to notifications, keep-awake, and change events.
    fn watch_status(&self, name: &str, session: &Session) {
        let mut status_rx = session.subscribe_status();
        let notifications = self.notifications.clone();
        let keep_awake = self.keep_awake.clone();
        let change_tx = self.change_tx.clone();
        let name = name.to_string();
        tokio::spawn(async move {
            while status_rx.changed().await.is_ok() {
                let status = *status_rx.borrow_and_update();
                notifications.handle(&name, status);
                keep_awake.handle(&name, status);
                let _ = change_tx.send(());
            }
        });
    }

    fn persist(&self) {
        let spaces: Vec<PersistedSpace> = self
            .metadata
            .lock()
            .unwrap()
            .iter()
            .map(|(name, meta)| PersistedSpace {
                name: name.clone(),
                folders: meta.folders.clone(),
                agent: meta.agent.clone(),
                account: meta.account.clone(),
                defaults: meta.defaults.clone(),
                root: meta.root.clone(),
            })
            .collect();
        save_spaces(&spaces);
    }

    fn emit_change(&self) {
        let _ = self.change_tx.send(());
    }
}

fn basename(command: &str) -> &str {
    command.rsplit(['/', '\\']).next().unwrap_or(command)
}

/// Keeps only folders that still exist on disk. `.` (the whole work folder) is always kept;
/// if pruning removes everything, falls back to `["."]`.
fn existing_folders(root: &str, folders: &[String]) -> Vec<String> {
    let kept: Vec<String> = folders
        .iter()
        .filter(|folder| folder.as_str() == "." || Path::new(root).join(folder).is_dir())
        .cloned()
        .collect();
    if kept.is_empty() {
        vec![".".to_string()]
    } else {
        kept
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::keep_awake::backend::NoopKeepAwake;
    use crate::notifications::notifier::NoopNotifier;

    fn service() -> Arc<WorkspaceService> {
        let notifications = Arc::new(NotificationController::new(Arc::new(NoopNotifier)));
        let keep_awake = Arc::new(KeepAwakeController::new(
            Arc::new(NoopKeepAwake),
            KeepAwakeMode::Off,
        ));
        WorkspaceService::new(notifications, keep_awake)
    }

    #[tokio::test]
    #[serial_test::serial]
    async fn creates_lists_and_removes_a_space() {
        let home = tempfile::tempdir().unwrap();
        std::env::set_var("SOROMI_HOME", home.path());

        let root = tempfile::tempdir().unwrap();
        std::fs::write(root.path().join("readme.md"), "hi").unwrap();

        let service = service();
        let result = service
            .create_space(CreateSpaceInput {
                name: "kazomi".into(),
                root: root.path().to_string_lossy().into_owned(),
                agent: "/bin/cat".into(),
                account: "personal".into(),
                folders: None,
            })
            .unwrap();
        assert_eq!(result.workspace, "kazomi");

        let summaries = service.summaries();
        assert_eq!(summaries.len(), 1);
        assert_eq!(summaries[0].name, "kazomi");
        assert_eq!(summaries[0].folders, vec![".".to_string()]);

        let listing = service.list_dir("kazomi", "");
        assert!(listing.iter().any(|entry| entry.name == "readme.md"));
        assert_eq!(service.read_file("kazomi", "readme.md").content, "hi");

        service.remove_space("kazomi");
        assert!(service.summaries().is_empty());

        service.dispose();
        std::env::remove_var("SOROMI_HOME");
    }

    #[test]
    fn existing_folders_drops_missing_and_falls_back_to_dot() {
        let dir = tempfile::tempdir().unwrap();
        std::fs::create_dir_all(dir.path().join("api")).unwrap();
        let root = dir.path().to_string_lossy().into_owned();

        assert_eq!(
            existing_folders(&root, &["api".into(), "gone".into()]),
            vec!["api".to_string()]
        );
        assert_eq!(
            existing_folders(&root, &["gone".into()]),
            vec![".".to_string()]
        );
        assert_eq!(
            existing_folders(&root, &[".".into()]),
            vec![".".to_string()]
        );
    }

    #[tokio::test]
    #[serial_test::serial]
    async fn rejects_a_missing_root() {
        let home = tempfile::tempdir().unwrap();
        std::env::set_var("SOROMI_HOME", home.path());
        let service = service();
        let result = service.create_space(CreateSpaceInput {
            name: "x".into(),
            root: "/no/such/folder".into(),
            agent: "/bin/cat".into(),
            account: "personal".into(),
            folders: None,
        });
        assert!(result.is_err());
        std::env::remove_var("SOROMI_HOME");
    }
}
