use std::collections::HashMap;
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};

use soromi_protocol::{
    AgentAccount, DirEntry, KeepAwakeMode, SessionSummary, Status, WorkspaceSummary,
};
use tokio::sync::broadcast;

use crate::accounts::loader::{accounts_dir, load_account_profile};
use crate::accounts::resolver::{expand_home, resolve_launch_env};
use crate::files::directory::list_directory;
use crate::files::paths::resolve_within;
use crate::files::reader::{FileRead, read_file_within};
use crate::files::watcher::DirectoryWatcher;
use crate::home::soromi_home;
use crate::keep_awake::controller::KeepAwakeController;
use crate::notifications::controller::NotificationController;
use crate::sessions::manager::SessionManager;
use crate::sessions::session::{Session, SessionOptions};
use crate::sound::player::{Cue, SoundPlayer};
use crate::updates::UpdateInfo;
use crate::workspaces::agent_command::parse_agent_command;
use crate::workspaces::config::{PersistedSpace, SessionSpec, Workspace};
use crate::workspaces::space_store::{load_spaces, save_spaces};
use crate::workspaces::workspace_loader::load_workspace;

struct WorkspaceMeta {
    folders: Vec<String>,
    root: String,
    /// Which account each agent runs under (one entry per agent).
    accounts: Vec<AgentAccount>,
    /// Ordered tabs; each is a live PTY keyed in the session manager by its id.
    sessions: Vec<SessionSpec>,
    /// Instructions appended to the agent's system prompt for sessions started here.
    instructions: Option<String>,
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
/// they restore when the daemon restarts. A workspace holds one or more terminal sessions
/// (tabs); each session's account is resolved from the workspace's per-agent account bindings.
/// `open_workspace` imports an optional `soromi.space.json`. A missing account profile is
/// non-fatal (runs under the base env with a warning). Interior-mutable and `Arc`-shared.
pub struct WorkspaceService {
    manager: SessionManager,
    metadata: Mutex<Vec<(String, WorkspaceMeta)>>,
    notifications: Arc<NotificationController>,
    keep_awake: Arc<KeepAwakeController>,
    sound: Arc<dyn SoundPlayer>,
    change_tx: broadcast::Sender<()>,
    /// A newer release than the running build, once the update check finds one.
    update: Mutex<Option<UpdateInfo>>,
    /// Whether the app window is focused. While it is, agent-event sounds and banners are
    /// suppressed (the user is already looking at the app). Set by the shell; false by default,
    /// so the standalone daemon always fires.
    focused: AtomicBool,
    /// PATH to launch sessions with, when the process's own PATH is too narrow (a GUI-launched
    /// app has no shell PATH). The shell resolves it and passes it here; `None` keeps the
    /// process PATH (a terminal-launched daemon already has the full one).
    launch_path: Option<String>,
    /// Watches the directories the file tree shows; announces which one changed on `dir_change_tx`.
    watcher: DirectoryWatcher,
    /// `(workspace, path)` of a directory that changed on disk, for viewports to re-list.
    dir_change_tx: broadcast::Sender<(String, String)>,
    /// A session id whose agent was just relaunched, for viewports to re-attach.
    reset_tx: broadcast::Sender<String>,
    /// Cached usage per account config dir (`expiry`, resolved entry). `None` = nothing to show.
    /// Avoids hitting the provider APIs on every popup open; a manual refresh skips it.
    usage_cache: Mutex<HashMap<String, (Instant, Option<soromi_protocol::AgentUsage>)>>,
    /// The viewport that currently controls the terminals (`None` = none attached). Only its input
    /// and resizes apply; others see a takeover. Auto-passed to a remaining viewer when it leaves.
    controller: Mutex<Option<u64>>,
    /// Attached viewports `(id, display name)`, in join order, for control transfer + the takeover label.
    viewers: Mutex<Vec<(u64, String)>>,
    /// Fires when control changes, so each viewport re-derives its own control state.
    control_tx: broadcast::Sender<()>,
}

/// How long a stable usage result (fetched, scope-denied, or not signed in) stays cached.
const USAGE_TTL: Duration = Duration::from_secs(15 * 60);

/// A shorter cache for a temporary failure (rate limit / server error), so it recovers sooner.
const USAGE_TTL_TEMPORARY: Duration = Duration::from_secs(60);

impl WorkspaceService {
    /// Must be called within a tokio runtime: restoring spaces spawns their status watchers.
    pub fn new(
        notifications: Arc<NotificationController>,
        keep_awake: Arc<KeepAwakeController>,
        sound: Arc<dyn SoundPlayer>,
        launch_path: Option<String>,
    ) -> Arc<Self> {
        let (change_tx, _) = broadcast::channel(64);
        let (dir_change_tx, _) = broadcast::channel(64);
        let (reset_tx, _) = broadcast::channel(64);
        let watcher = DirectoryWatcher::new(dir_change_tx.clone());
        let service = Arc::new(Self {
            manager: SessionManager::new(),
            metadata: Mutex::new(Vec::new()),
            notifications,
            keep_awake,
            sound,
            change_tx,
            update: Mutex::new(None),
            focused: AtomicBool::new(false),
            launch_path,
            watcher,
            dir_change_tx,
            reset_tx,
            usage_cache: Mutex::new(HashMap::new()),
            controller: Mutex::new(None),
            viewers: Mutex::new(Vec::new()),
            control_tx: broadcast::channel(64).0,
        });
        // Agent-event hooks: listen on the socket the `hook` bridge delivers cues to.
        crate::hooks::listen::spawn(service.clone());
        let mut dirty = false;
        for mut space in load_spaces() {
            if migrate(&mut space) {
                dirty = true;
            }
            let kept = existing_folders(&space.root, &space.folders);
            if kept != space.folders {
                dirty = true;
                space.folders = kept;
            }
            service.spawn_space(space);
        }
        // Persist once if any space was migrated or had folders that no longer exist on disk.
        if dirty {
            service.persist();
        }
        service
    }

    pub fn subscribe_changes(&self) -> broadcast::Receiver<()> {
        self.change_tx.subscribe()
    }

    /// Subscribes to `(workspace, path)` notifications for directories that changed on disk.
    pub fn subscribe_dir_changes(&self) -> broadcast::Receiver<(String, String)> {
        self.dir_change_tx.subscribe()
    }

    /// Subscribes to session ids whose agent was relaunched, so viewports can re-attach.
    pub fn subscribe_resets(&self) -> broadcast::Receiver<String> {
        self.reset_tx.subscribe()
    }

    /// Subscribes to terminal-control changes, so each viewport re-derives whether it is in control.
    pub fn subscribe_control(&self) -> broadcast::Receiver<()> {
        self.control_tx.subscribe()
    }

    /// Registers a viewport `(id, display name)`. The first to attach becomes the controller.
    pub fn register_viewer(&self, id: u64, name: String) {
        {
            let mut viewers = self.viewers.lock().unwrap();
            viewers.push((id, name));
            let mut controller = self.controller.lock().unwrap();
            if controller.is_none() {
                *controller = Some(id);
            }
        }
        let _ = self.control_tx.send(());
    }

    /// Unregisters a viewport. If it held control, control passes to another remaining viewport.
    pub fn unregister_viewer(&self, id: u64) {
        {
            let mut viewers = self.viewers.lock().unwrap();
            viewers.retain(|(viewer, _)| *viewer != id);
            let mut controller = self.controller.lock().unwrap();
            if *controller == Some(id) {
                *controller = viewers.first().map(|(viewer, _)| *viewer);
            }
        }
        let _ = self.control_tx.send(());
    }

    /// Hands sole terminal control to a viewport (its "Take control" action).
    pub fn take_control(&self, id: u64) {
        *self.controller.lock().unwrap() = Some(id);
        let _ = self.control_tx.send(());
    }

    /// Whether a viewport currently controls the terminals (drives input / owns the size).
    pub fn is_controller(&self, id: u64) -> bool {
        *self.controller.lock().unwrap() == Some(id)
    }

    /// The controlling viewport's display name (for a viewport that is not itself the controller).
    pub fn controller_name(&self) -> Option<String> {
        let controller = (*self.controller.lock().unwrap())?;
        let viewers = self.viewers.lock().unwrap();
        viewers
            .iter()
            .find(|(viewer, _)| *viewer == controller)
            .map(|(_, name)| name.clone())
    }

    /// Sets whether the app window is focused. While focused, agent-event sounds and banners are
    /// suppressed; they fire only when the user is away from the app.
    pub fn set_focused(&self, focused: bool) {
        self.focused.store(focused, Ordering::Relaxed);
    }

    /// Records a tab's agent conversation id (from its session-start hook), so a later restore
    /// resumes that conversation. Persists only when it actually changed.
    pub fn set_resume_id(&self, session_id: &str, resume_id: String) {
        let mut changed = false;
        {
            let mut metadata = self.metadata.lock().unwrap();
            for (_, meta) in metadata.iter_mut() {
                if let Some(session) = meta.sessions.iter_mut().find(|s| s.id == session_id) {
                    if session.resume_id.as_deref() != Some(resume_id.as_str()) {
                        session.resume_id = Some(resume_id);
                        changed = true;
                    }
                    break;
                }
            }
        }
        if changed {
            self.persist();
        }
    }

    /// Records an available update and wakes viewports so they can show the banner.
    pub fn set_update(&self, info: UpdateInfo) {
        *self.update.lock().unwrap() = Some(info);
        self.emit_change();
    }

    /// The available update, if the check has found one.
    pub fn update_info(&self) -> Option<UpdateInfo> {
        self.update.lock().unwrap().clone()
    }

    /// Creates a space with a single initial tab (its `agent`), bound to `account`.
    pub fn create_space(&self, input: CreateSpaceInput) -> anyhow::Result<OpenResult> {
        let folders = match input.folders {
            Some(folders) if !folders.is_empty() => folders,
            _ => vec![".".to_string()],
        };
        let space = PersistedSpace {
            name: input.name,
            folders,
            root: input.root,
            accounts: vec![AgentAccount {
                id: input.account,
                agent: input.agent.clone(),
            }],
            sessions: vec![SessionSpec {
                id: new_session_id(),
                agent: input.agent,
                title: None,
                resume_id: None,
            }],
            instructions: None,
            agent: None,
            account: None,
        };
        self.add_space(space)
    }

    /// Imports `<dir>/soromi.space.json`, opening one tab per configured account binding.
    pub fn open_workspace(&self, dir: &str) -> anyhow::Result<OpenResult> {
        let loaded = load_workspace(dir)?;
        let accounts = loaded.workspace.accounts;
        let mut sessions: Vec<SessionSpec> = accounts
            .iter()
            .map(|a| SessionSpec {
                id: new_session_id(),
                agent: a.agent.clone(),
                title: None,
                resume_id: None,
            })
            .collect();
        if sessions.is_empty() {
            sessions.push(SessionSpec {
                id: new_session_id(),
                agent: "claude".to_string(),
                title: None,
                resume_id: None,
            });
        }
        let space = PersistedSpace {
            name: loaded.workspace.name,
            folders: loaded.workspace.folders,
            root: loaded.root,
            accounts,
            sessions,
            instructions: loaded.workspace.instructions,
            agent: None,
            account: None,
        };
        self.add_space(space)
    }

    fn add_space(&self, space: PersistedSpace) -> anyhow::Result<OpenResult> {
        if self.has(&space.name) {
            return Ok(OpenResult {
                workspace: space.name,
                warning: None,
            });
        }
        if !Path::new(&space.root).is_dir() {
            anyhow::bail!("folder not found: {}", space.root);
        }
        let name = space.name.clone();
        let warning = self.spawn_space(space);
        self.persist();
        self.emit_change();
        Ok(OpenResult {
            workspace: name,
            warning,
        })
    }

    /// Opens a new tab in a workspace. When `account` is given and the agent has no binding yet,
    /// it is recorded as that agent's account; otherwise the existing binding is used.
    pub fn open_session(
        &self,
        workspace: &str,
        agent: String,
        account: Option<String>,
    ) -> anyhow::Result<SessionSummary> {
        let session = SessionSpec {
            id: new_session_id(),
            agent: agent.clone(),
            title: None,
            // Fresh tab; its resume_id is captured from the agent's session-start hook.
            resume_id: None,
        };
        let (root, folders, accounts, instructions) = {
            let mut metadata = self.metadata.lock().unwrap();
            let (_, meta) = metadata
                .iter_mut()
                .find(|(n, _)| n == workspace)
                .ok_or_else(|| anyhow::anyhow!("workspace not found: {workspace}"))?;
            if let Some(id) = account
                && !meta.accounts.iter().any(|a| a.agent == agent)
            {
                meta.accounts.push(AgentAccount {
                    id,
                    agent: agent.clone(),
                });
            }
            meta.sessions.push(session.clone());
            (
                meta.root.clone(),
                meta.folders.clone(),
                meta.accounts.clone(),
                meta.instructions.clone(),
            )
        };
        self.start_session(
            workspace,
            &root,
            &folders,
            &accounts,
            instructions.as_deref(),
            &session,
        );
        self.persist();
        self.emit_change();
        Ok(SessionSummary {
            id: session.id,
            account: account_for(&accounts, &agent),
            agent,
            status: Status::Idle,
            title: None,
        })
    }

    /// Renames a tab. An empty title clears the custom name (back to the account label).
    pub fn rename_session(&self, session_id: &str, title: String) {
        let title = if title.trim().is_empty() {
            None
        } else {
            Some(title)
        };
        let mut changed = false;
        {
            let mut metadata = self.metadata.lock().unwrap();
            for (_, meta) in metadata.iter_mut() {
                if let Some(session) = meta.sessions.iter_mut().find(|s| s.id == session_id) {
                    session.title = title;
                    changed = true;
                    break;
                }
            }
        }
        if changed {
            self.persist();
            self.emit_change();
        }
    }

    /// Closes a tab (by session id) and disposes its PTY.
    pub fn close_session(&self, session_id: &str) {
        self.manager.dispose(session_id);
        {
            let mut metadata = self.metadata.lock().unwrap();
            for (_, meta) in metadata.iter_mut() {
                meta.sessions.retain(|s| s.id != session_id);
            }
        }
        self.persist();
        self.emit_change();
    }

    pub fn remove_space(&self, name: &str) {
        if !self.has(name) {
            return;
        }
        let ids: Vec<String> = {
            let metadata = self.metadata.lock().unwrap();
            metadata
                .iter()
                .find(|(n, _)| n == name)
                .map(|(_, meta)| meta.sessions.iter().map(|s| s.id.clone()).collect())
                .unwrap_or_default()
        };
        for id in ids {
            self.manager.dispose(&id);
        }
        self.metadata.lock().unwrap().retain(|(n, _)| n != name);
        self.watcher.unwatch_workspace(name);
        self.persist();
        self.emit_change();
    }

    /// Reorders the spaces to match `order` (workspace names, top to bottom). Names not in `order`
    /// keep their relative position at the end, so a stale/partial list never drops a workspace.
    pub fn reorder_spaces(&self, order: &[String]) {
        {
            let mut metadata = self.metadata.lock().unwrap();
            let rank: std::collections::HashMap<&str, usize> = order
                .iter()
                .enumerate()
                .map(|(i, name)| (name.as_str(), i))
                .collect();
            // A stable sort by rank (unlisted names get `len`, so they trail in their current order).
            metadata.sort_by_key(|(name, _)| *rank.get(name.as_str()).unwrap_or(&order.len()));
        }
        self.persist();
        self.emit_change();
    }

    /// Returns a live session by its id.
    pub fn get(&self, id: &str) -> Option<Arc<Session>> {
        self.manager.get(id)
    }

    pub fn names(&self) -> Vec<String> {
        self.manager.names()
    }

    pub fn summaries(&self) -> Vec<WorkspaceSummary> {
        let metadata = self.metadata.lock().unwrap();
        metadata
            .iter()
            .map(|(name, meta)| {
                let sessions: Vec<SessionSummary> = meta
                    .sessions
                    .iter()
                    .map(|session| SessionSummary {
                        id: session.id.clone(),
                        agent: session.agent.clone(),
                        account: account_for(&meta.accounts, &session.agent),
                        status: self
                            .manager
                            .get(&session.id)
                            .map(|s| s.status())
                            .unwrap_or(Status::Idle),
                        title: session.title.clone(),
                    })
                    .collect();
                WorkspaceSummary {
                    name: name.clone(),
                    status: aggregate_status(&sessions),
                    root: meta.root.clone(),
                    folders: meta.folders.clone(),
                    accounts: meta.accounts.clone(),
                    sessions,
                    instructions: meta.instructions.clone(),
                }
            })
            .collect()
    }

    pub fn list_dir(&self, workspace: &str, path: &str) -> Vec<DirEntry> {
        // Copy what listing needs, then drop the lock before disk reads and watch registration.
        let dirs = {
            let metadata = self.metadata.lock().unwrap();
            metadata
                .iter()
                .find(|(name, _)| name == workspace)
                .map(|(_, meta)| (meta.root.clone(), meta.folders.clone()))
        };
        let Some((root, folders)) = dirs else {
            return Vec::new();
        };
        // Watch the directory this listing reads, so a change to it re-lists live.
        if let Some(dir) = listing_dir(&root, &folders, path) {
            self.watcher.watch(workspace, path, &dir);
        }
        list_directory(Path::new(&root), &folders, path)
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

    /// Lists the slash commands and skills available to a session's agent (Claude only for now).
    pub fn list_skills(&self, session_id: &str) -> Vec<soromi_protocol::Skill> {
        let resolved = {
            let metadata = self.metadata.lock().unwrap();
            metadata.iter().find_map(|(_, meta)| {
                meta.sessions.iter().find(|s| s.id == session_id).map(|s| {
                    (
                        s.agent.clone(),
                        account_for(&meta.accounts, &s.agent),
                        meta.root.clone(),
                        meta.folders.clone(),
                    )
                })
            })
        };
        let Some((agent, account, root, folders)) = resolved else {
            return Vec::new();
        };
        let command = basename(agent.split_whitespace().next().unwrap_or(&agent));
        // Project skills live in the folders the session actually runs at (the selected work
        // folders), not just the workspace root.
        let (cwd, extra) = session_dirs(&root, &folders);
        let mut project_roots: Vec<PathBuf> = vec![PathBuf::from(cwd)];
        project_roots.extend(extra.into_iter().map(PathBuf::from));
        let Some(provider) = crate::providers::provider(command) else {
            return Vec::new();
        };
        let dir = provider_config_dir(&account, provider);

        crate::skills::skills_for(provider, &dir, &project_roots)
    }

    /// Fetches plan usage for each agent active in a workspace, reading OAuth tokens from the
    /// bound accounts' config dirs and calling each provider's usage endpoint. Agents whose account
    /// is signed in but whose login lacks the usage scope get a `note` instead of windows, so the
    /// viewport can prompt a re-login. Agents with no usage endpoint, no login, or a transient error
    /// are omitted. Returns one entry per distinct agent.
    pub async fn request_usage(
        &self,
        workspace: &str,
        force: bool,
    ) -> Vec<soromi_protocol::AgentUsage> {
        let targets = {
            let metadata = self.metadata.lock().unwrap();
            let Some((_, meta)) = metadata.iter().find(|(name, _)| name == workspace) else {
                return Vec::new();
            };

            let mut seen: Vec<(&'static dyn crate::providers::Provider, PathBuf)> = Vec::new();
            for session in &meta.sessions {
                let command = basename(
                    session
                        .agent
                        .split_whitespace()
                        .next()
                        .unwrap_or(&session.agent),
                );
                let Some(provider) = crate::providers::provider(command) else {
                    continue;
                };
                if seen.iter().any(|(p, _)| p.key() == provider.key()) {
                    continue;
                }
                let account = account_for(&meta.accounts, &session.agent);
                seen.push((provider, provider_config_dir(&account, provider)));
            }

            seen
        };

        if targets.is_empty() {
            return Vec::new();
        }

        let client = reqwest::Client::new();
        let fetches = targets.iter().map(|(provider, dir)| {
            let client = &client;
            async move {
                let key = dir.to_string_lossy().into_owned();

                // Serve a cache entry that has not expired without touching the network (unless
                // forced).
                if !force
                    && let Some((expiry, entry)) = self.usage_cache.lock().unwrap().get(&key)
                    && *expiry > Instant::now()
                {
                    return entry.clone();
                }

                use crate::providers::usage::UsageOutcome;
                let (entry, ttl) =
                    match crate::providers::usage::fetch(*provider, dir, client).await {
                        UsageOutcome::Usage(usage) => (Some(usage), USAGE_TTL),
                        UsageOutcome::Forbidden => (Some(usage_scope_note(*provider)), USAGE_TTL),
                        UsageOutcome::Temporary => {
                            (Some(usage_temporary_note(*provider)), USAGE_TTL_TEMPORARY)
                        }
                        UsageOutcome::NotSignedIn => (None, USAGE_TTL),
                    };

                self.usage_cache
                    .lock()
                    .unwrap()
                    .insert(key, (Instant::now() + ttl, entry.clone()));

                entry
            }
        });

        futures_util::future::join_all(fetches)
            .await
            .into_iter()
            .flatten()
            .collect()
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
            accounts: meta.accounts.clone(),
            instructions: meta.instructions.clone(),
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

    /// Replaces a workspace's account bindings and work folders. Restarts only the sessions whose
    /// resolved account changed (so an unchanged rebind leaves running tabs untouched). Folder
    /// changes are not applied to running tabs: a session's cwd/add-dir is fixed at launch, and
    /// removing a folder should not kill a running agent. New tabs pick up the new folders. Keeps
    /// at least one folder: an empty list falls back to the whole root (`.`).
    pub fn update_space(
        &self,
        name: &str,
        new_name: Option<String>,
        accounts: Vec<AgentAccount>,
        folders: Vec<String>,
        root: Option<String>,
        instructions: Option<String>,
    ) -> anyhow::Result<OpenResult> {
        // Resolve (and validate) a rename up front, so we don't touch anything on a name clash.
        let rename = new_name
            .map(|n| n.trim().to_string())
            .filter(|n| !n.is_empty() && n != name);
        if let Some(target) = &rename {
            let metadata = self.metadata.lock().unwrap();
            if metadata.iter().any(|(n, _)| n == target) {
                anyhow::bail!("a workspace named \"{target}\" already exists");
            }
        }

        let folders = if folders.is_empty() {
            vec![".".to_string()]
        } else {
            folders
        };
        let instructions = instructions.filter(|text| !text.trim().is_empty());
        let (old_root, sessions, old_accounts, old_folders) = {
            let metadata = self.metadata.lock().unwrap();
            let (_, meta) = metadata
                .iter()
                .find(|(n, _)| n == name)
                .ok_or_else(|| anyhow::anyhow!("workspace not found: {name}"))?;
            (
                meta.root.clone(),
                meta.sessions.clone(),
                meta.accounts.clone(),
                meta.folders.clone(),
            )
        };
        let root = root.filter(|r| !r.is_empty()).unwrap_or(old_root.clone());
        // Changing the folders or the root changes every session's launch dirs (cwd / `--add-dir`),
        // so all tabs relaunch to pick them up; an account change relaunches just that tab.
        let folders_changed = old_folders != folders || old_root != root;
        if let Some((_, meta)) = self
            .metadata
            .lock()
            .unwrap()
            .iter_mut()
            .find(|(n, _)| n == name)
        {
            meta.accounts = accounts.clone();
            meta.folders = folders.clone();
            meta.root = root.clone();
            meta.instructions = instructions.clone();
        }
        let mut warning = None;
        for session in &sessions {
            let account_changed = account_for(&old_accounts, &session.agent)
                != account_for(&accounts, &session.agent);
            if account_changed || folders_changed {
                self.manager.dispose(&session.id);
                warning = warning.or(self.start_session(
                    name,
                    &root,
                    &folders,
                    &accounts,
                    instructions.as_deref(),
                    session,
                ));
                // Tell viewports to re-attach, so the terminal shows the relaunched agent.
                let _ = self.reset_tx.send(session.id.clone());
            }
        }

        // Rename last, once everything else applied. Sessions keep their ids and their agents
        // resolve the workspace name fresh from metadata, so no relaunch is needed; just re-key the
        // entry and drop the old name's directory watches (new ones re-register on the next list).
        let final_name = match rename {
            Some(target) => {
                if let Some(entry) = self
                    .metadata
                    .lock()
                    .unwrap()
                    .iter_mut()
                    .find(|(n, _)| n == name)
                {
                    entry.0 = target.clone();
                }
                self.watcher.unwatch_workspace(name);
                target
            }
            None => name.to_string(),
        };

        // The workspace root is a synthetic listing of its folders, so no filesystem watcher fires
        // when they change. Push a fresh root listing so the file tree shows the new folder set.
        if folders_changed {
            let _ = self.dir_change_tx.send((final_name.clone(), String::new()));
        }

        self.persist();
        self.emit_change();
        Ok(OpenResult {
            workspace: final_name,
            warning,
        })
    }

    /// Launches a space's tabs, wires their status watchers, and records its metadata. A tab that
    /// has a captured `resume_id` resumes its prior conversation instead of starting fresh.
    fn spawn_space(&self, space: PersistedSpace) -> Option<String> {
        let mut warning = None;
        for session in &space.sessions {
            warning = warning.or(self.start_session(
                &space.name,
                &space.root,
                &space.folders,
                &space.accounts,
                space.instructions.as_deref(),
                session,
            ));
        }
        self.metadata.lock().unwrap().push((
            space.name,
            WorkspaceMeta {
                folders: space.folders,
                root: space.root,
                accounts: space.accounts,
                sessions: space.sessions,
                instructions: space.instructions,
            },
        ));
        warning
    }

    /// Starts (or restarts) one session's PTY, keyed by its id, and wires its status watcher.
    /// Returns an account warning if the profile could not be applied.
    fn start_session(
        &self,
        workspace: &str,
        root: &str,
        folders: &[String],
        accounts: &[AgentAccount],
        instructions: Option<&str>,
        session: &SessionSpec,
    ) -> Option<String> {
        let parsed = match parse_agent_command(&session.agent) {
            Ok(parsed) => parsed,
            Err(_) => return Some(format!("agent command for \"{workspace}\" is empty")),
        };

        // Run at the picked folders, not their common parent: cwd is the first folder and the
        // rest are named via the provider's add-dir flag, so the agent's scope is exactly them.
        let (cwd, extra_dirs) = session_dirs(root, folders);
        let command = basename(&parsed.command);
        let provider = crate::providers::provider(command);
        let account = account_for(accounts, &session.agent);
        let mut args = parsed.args;
        if let Some(provider) = provider {
            // Name each extra folder, append the workspace instructions to the system prompt, and
            // resume this tab's prior conversation, each per the provider's own mechanism.
            if let Some(flag) = provider.add_dir_flag() {
                for dir in &extra_dirs {
                    args.push(flag.to_string());
                    args.push(dir.clone());
                }
            }
            if let Some(text) = instructions.map(str::trim).filter(|t| !t.is_empty())
                && let Some(flag) = provider.system_prompt_flag()
            {
                args.push(flag.to_string());
                args.push(text.to_string());
            }
            // Only resume when the prior conversation still exists (skip a stale id: an unused tab
            // whose conversation was never saved, a pruned one, or one from a since-changed cwd), so
            // the agent starts fresh instead of erroring with "No conversation found".
            if let Some(resume_id) = &session.resume_id
                && provider.resume_available(
                    &provider_config_dir(&account, provider),
                    &cwd,
                    resume_id,
                )
            {
                provider.apply_resume(&mut args, resume_id);
            }
        }

        let mut base_env: Vec<(String, String)> = std::env::vars().collect();
        // Use the shell-resolved PATH when set, so a GUI-launched app's agents find their
        // binaries, without mutating this process's global environment.
        if let Some(path) = &self.launch_path {
            match base_env.iter_mut().find(|(key, _)| key == "PATH") {
                Some(entry) => entry.1 = path.clone(),
                None => base_env.push(("PATH".to_string(), path.clone())),
            }
        }
        let mut env = base_env.clone();
        let mut warning = None;
        match load_account_profile(&account, &accounts_dir()) {
            Ok(profile) => {
                let resolved = resolve_launch_env(&profile, basename(&parsed.command), &base_env);
                for dir in &resolved.ensure_dirs {
                    let _ = fs::create_dir_all(dir);
                }
                env = resolved.env;
            }
            Err(_) => {
                warning = Some(format!(
                    "account \"{account}\" is not configured; running under the default environment"
                ));
            }
        }

        // Identify this session to the agent hooks (the bridge reads these), so their events
        // map back to it and reach this daemon's socket.
        upsert_env(&mut env, "SOROMI_SESSION", session.id.clone());
        upsert_env(
            &mut env,
            "SOROMI_HOME",
            soromi_home().to_string_lossy().into_owned(),
        );

        // Install Soromi's event hooks into the agent's config dir, so permission / done events
        // reach the daemon reliably (no terminal parsing).
        if let Some(provider) = provider {
            let config_dir = config_dir_from(
                &env,
                provider.config_env_var(),
                provider.default_config_dir(),
            );
            let _ = provider.install_hooks(&config_dir);
        }

        let options = SessionOptions {
            command: parsed.command,
            args,
            cwd,
            env: Some(env),
            cols: 80,
            rows: 24,
        };
        if let Ok(sess) = self.manager.ensure(&session.id, options) {
            self.watch_status(&session.id, &sess);
        }
        warning
    }

    /// Forwards a session's parsed status to keep-awake and the rail (change events). Sound and
    /// notifications come from the agent hooks (reliable), not this heuristic status parser.
    fn watch_status(&self, session_id: &str, session: &Session) {
        let mut status_rx = session.subscribe_status();
        let keep_awake = self.keep_awake.clone();
        let change_tx = self.change_tx.clone();
        let session_id = session_id.to_string();
        tokio::spawn(async move {
            while status_rx.changed().await.is_ok() {
                let status = *status_rx.borrow_and_update();
                keep_awake.handle(&session_id, status);
                let _ = change_tx.send(());
            }
        });
    }

    /// Handles an agent-hook event (from the socket listener): resolves the session's workspace,
    /// and if it is not muted, plays the cue and fires a banner. `agent` is the source that fired
    /// it (e.g. `claude`), named in the banner when present.
    pub fn handle_agent_event(&self, session_id: &str, cue: Cue, agent: Option<&str>) {
        // Reflect the event in the tab's status (the reliable, per-agent-normalized signal),
        // regardless of focus or mute; only the sound and banner below are conditional.
        let status = match cue {
            Cue::Complete => Status::Done,
            Cue::Request => Status::WaitingInput,
            Cue::Question => Status::Blocked,
        };
        if let Some(session) = self.manager.get(session_id) {
            session.set_hook_status(status);
        }

        let workspace = {
            let metadata = self.metadata.lock().unwrap();
            metadata
                .iter()
                .find(|(_, meta)| meta.sessions.iter().any(|s| s.id == session_id))
                .map(|(name, _)| name.clone())
        };
        let Some(workspace) = workspace else {
            return;
        };
        if self.notifications.is_muted(&workspace) {
            return;
        }
        // While the user is looking at the app, a sound and banner add nothing; only fire when away.
        if self.focused.load(Ordering::Relaxed) {
            return;
        }
        self.sound.play(cue);
        let text = match agent {
            Some(agent) => format!("({agent}) {}", cue_text(cue)),
            None => cue_text(cue).to_string(),
        };
        self.notifications.fire(&workspace, &text);
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
                root: meta.root.clone(),
                accounts: meta.accounts.clone(),
                sessions: meta.sessions.clone(),
                instructions: meta.instructions.clone(),
                agent: None,
                account: None,
            })
            .collect();
        save_spaces(&spaces);
    }

    fn emit_change(&self) {
        let _ = self.change_tx.send(());
    }
}

fn new_session_id() -> String {
    uuid::Uuid::new_v4().to_string()
}

fn basename(command: &str) -> &str {
    command.rsplit(['/', '\\']).next().unwrap_or(command)
}

/// A provider's config dir for an account: its profile `configDir` if set, else the provider's
/// config env var (e.g. `CLAUDE_CONFIG_DIR` / `CODEX_HOME`), else `~/<default>`.
fn provider_config_dir(account: &str, provider: &dyn crate::providers::Provider) -> PathBuf {
    if let Ok(profile) = load_account_profile(account, &accounts_dir())
        && let Some(dir) = profile
            .providers
            .get(provider.key())
            .and_then(|entry| entry.config_dir.as_ref())
    {
        let home = dirs::home_dir()
            .unwrap_or_default()
            .to_string_lossy()
            .into_owned();
        return PathBuf::from(expand_home(dir, &home));
    }
    std::env::var(provider.config_env_var())
        .map(PathBuf::from)
        .unwrap_or_else(|_| {
            dirs::home_dir()
                .unwrap_or_default()
                .join(provider.default_config_dir())
        })
}

/// A usage entry (no windows) for a signed-in account whose login lacks the usage scope: the
/// endpoint returned 401/403. The note tells the user how to enable it.
fn usage_scope_note(provider: &dyn crate::providers::Provider) -> soromi_protocol::AgentUsage {
    usage_note(
        provider,
        "This account's login can't read usage. Re-run the login for this account (open a tab on \
         it and sign in again) to enable it.",
    )
}

/// A usage entry (no windows) for a signed-in account whose usage could not be read right now (rate
/// limit or server error). Cached briefly, so a refresh soon after may recover.
fn usage_temporary_note(provider: &dyn crate::providers::Provider) -> soromi_protocol::AgentUsage {
    usage_note(
        provider,
        "Usage isn't available for this account right now (the provider may be rate-limiting). Try \
         refresh in a bit.",
    )
}

/// Builds a windows-less usage entry carrying a note, for an agent whose usage can't be shown.
fn usage_note(
    provider: &dyn crate::providers::Provider,
    note: &str,
) -> soromi_protocol::AgentUsage {
    soromi_protocol::AgentUsage {
        agent: provider.key().to_string(),
        plan: None,
        windows: Vec::new(),
        note: Some(note.to_string()),
    }
}

/// The agent's config dir: the resolved env var if set, else `~/<default>`.
fn config_dir_from(env: &[(String, String)], var: &str, default: &str) -> PathBuf {
    env.iter()
        .find(|(key, _)| key == var)
        .map(|(_, value)| PathBuf::from(value))
        .unwrap_or_else(|| dirs::home_dir().unwrap_or_default().join(default))
}

/// Sets or replaces an env var in a launch env list.
fn upsert_env(env: &mut Vec<(String, String)>, key: &str, value: String) {
    if let Some(slot) = env.iter_mut().find(|(k, _)| k == key) {
        slot.1 = value;
    } else {
        env.push((key.to_string(), value));
    }
}

/// The banner text for an agent-event cue.
fn cue_text(cue: Cue) -> &'static str {
    match cue {
        Cue::Request => "needs your permission",
        Cue::Question => "is waiting for you",
        Cue::Complete => "finished",
    }
}

/// Resolves a session's working directories from the workspace root and its picked folders. The
/// whole folder (`["."]`) runs at the root; otherwise the session runs at the first folder and
/// the rest become extra working dirs (all absolute).
fn session_dirs(root: &str, folders: &[String]) -> (String, Vec<String>) {
    if folders.iter().all(|f| f == ".") {
        return (root.to_string(), Vec::new());
    }
    let abs: Vec<String> = folders
        .iter()
        .map(|folder| Path::new(root).join(folder).to_string_lossy().into_owned())
        .collect();
    let cwd = abs.first().cloned().unwrap_or_else(|| root.to_string());
    let extra = abs.into_iter().skip(1).collect();
    (cwd, extra)
}

/// The account bound to an agent, or the built-in `personal` default when unbound.
fn account_for(accounts: &[AgentAccount], agent: &str) -> String {
    accounts
        .iter()
        .find(|a| a.agent == agent)
        .map(|a| a.id.clone())
        .unwrap_or_else(|| "personal".to_string())
}

/// The workspace's rail status: the most attention-worthy of its sessions.
fn aggregate_status(sessions: &[SessionSummary]) -> Status {
    let any = |status: Status| sessions.iter().any(|s| s.status == status);
    if any(Status::Thinking) {
        Status::Thinking
    } else if any(Status::WaitingInput) {
        Status::WaitingInput
    } else if any(Status::Blocked) {
        Status::Blocked
    } else if any(Status::Done) {
        Status::Done
    } else {
        Status::Idle
    }
}

/// Migrates a pre-tabs space (top-level `agent`/`account`, no `accounts`/`sessions`) into the
/// bindings-and-sessions shape. Returns true if anything was synthesized (so it is re-persisted).
fn migrate(space: &mut PersistedSpace) -> bool {
    let mut changed = false;
    if space.accounts.is_empty()
        && let Some(account) = space.account.take()
    {
        let agent = space.agent.clone().unwrap_or_else(|| "claude".to_string());
        space.accounts.push(AgentAccount { id: account, agent });
        changed = true;
    }
    if space.sessions.is_empty() {
        let agent = space
            .agent
            .clone()
            .or_else(|| space.accounts.first().map(|a| a.agent.clone()))
            .unwrap_or_else(|| "claude".to_string());
        space.sessions.push(SessionSpec {
            id: new_session_id(),
            agent,
            title: None,
            resume_id: None,
        });
        changed = true;
    }
    if space.agent.take().is_some() {
        changed = true;
    }
    changed
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

/// The absolute directory a listing reads from disk, or `None` when the listing is not a single
/// on-disk directory (the empty path of a multi-folder space just lists the declared folders).
fn listing_dir(root: &str, folders: &[String], path: &str) -> Option<PathBuf> {
    if path.is_empty() || path == "." {
        if folders.len() == 1 && folders[0] == "." {
            Some(PathBuf::from(root))
        } else {
            None
        }
    } else {
        resolve_within(Path::new(root), path)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::keep_awake::backend::NoopKeepAwake;
    use crate::notifications::notifier::NoopNotifier;
    use crate::sound::player::NoopSoundPlayer;

    fn service() -> Arc<WorkspaceService> {
        let notifications = Arc::new(NotificationController::new(Arc::new(NoopNotifier)));
        let keep_awake = Arc::new(KeepAwakeController::new(
            Arc::new(NoopKeepAwake),
            KeepAwakeMode::Off,
        ));
        WorkspaceService::new(notifications, keep_awake, Arc::new(NoopSoundPlayer), None)
    }

    #[tokio::test]
    #[serial_test::serial]
    async fn creates_lists_and_removes_a_space() {
        let home = tempfile::tempdir().unwrap();
        crate::home::set_soromi_home(Some(home.path().to_path_buf()));

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
        assert_eq!(summaries[0].sessions.len(), 1);
        assert_eq!(summaries[0].accounts.len(), 1);
        assert_eq!(summaries[0].accounts[0].id, "personal");

        let listing = service.list_dir("kazomi", "");
        assert!(listing.iter().any(|entry| entry.name == "readme.md"));
        assert_eq!(service.read_file("kazomi", "readme.md").content, "hi");

        service.remove_space("kazomi");
        assert!(service.summaries().is_empty());

        service.dispose();
        crate::home::set_soromi_home(None);
    }

    #[tokio::test]
    #[serial_test::serial]
    async fn update_space_can_drop_a_folder() {
        let home = tempfile::tempdir().unwrap();
        crate::home::set_soromi_home(Some(home.path().to_path_buf()));

        let root = tempfile::tempdir().unwrap();
        std::fs::create_dir_all(root.path().join("api")).unwrap();
        std::fs::create_dir_all(root.path().join("web")).unwrap();

        let service = service();
        service
            .create_space(CreateSpaceInput {
                name: "kazomi".into(),
                root: root.path().to_string_lossy().into_owned(),
                agent: "/bin/cat".into(),
                account: "personal".into(),
                folders: Some(vec!["api".into(), "web".into()]),
            })
            .unwrap();

        let accounts = service.summaries()[0].accounts.clone();
        service
            .update_space("kazomi", None, accounts, vec!["api".into()], None, None)
            .unwrap();

        assert_eq!(service.summaries()[0].folders, vec!["api".to_string()]);

        service.dispose();
        crate::home::set_soromi_home(None);
    }

    #[tokio::test]
    #[serial_test::serial]
    async fn update_space_can_rename_a_workspace() {
        let home = tempfile::tempdir().unwrap();
        crate::home::set_soromi_home(Some(home.path().to_path_buf()));

        let root = tempfile::tempdir().unwrap();
        let service = service();
        service
            .create_space(CreateSpaceInput {
                name: "before".into(),
                root: root.path().to_string_lossy().into_owned(),
                agent: "bash".into(),
                account: "personal".into(),
                folders: Some(vec![".".into()]),
            })
            .unwrap();

        let accounts = service.summaries()[0].accounts.clone();
        let result = service
            .update_space(
                "before",
                Some("after".into()),
                accounts,
                vec![".".into()],
                None,
                None,
            )
            .unwrap();

        assert_eq!(result.workspace, "after");
        let names: Vec<String> = service.summaries().into_iter().map(|s| s.name).collect();
        assert_eq!(names, vec!["after".to_string()]);

        service.dispose();
        crate::home::set_soromi_home(None);
    }

    #[tokio::test]
    #[serial_test::serial]
    async fn reorder_spaces_reorders_and_persists() {
        let home = tempfile::tempdir().unwrap();
        crate::home::set_soromi_home(Some(home.path().to_path_buf()));
        let root = tempfile::tempdir().unwrap();

        let hub = service();
        for name in ["a", "b", "c"] {
            hub.create_space(CreateSpaceInput {
                name: name.into(),
                root: root.path().to_string_lossy().into_owned(),
                agent: "bash".into(),
                account: "personal".into(),
                folders: Some(vec![".".into()]),
            })
            .unwrap();
        }

        let names = |s: &WorkspaceService| -> Vec<String> {
            s.summaries().into_iter().map(|x| x.name).collect()
        };
        assert_eq!(names(&hub), ["a", "b", "c"]);

        // Move "c" to the front; the rest keep their relative order.
        hub.reorder_spaces(&["c".into(), "a".into(), "b".into()]);
        assert_eq!(names(&hub), ["c", "a", "b"]);
        hub.dispose();

        // Persisted: a fresh service restores the new order.
        let restored = service();
        assert_eq!(names(&restored), ["c", "a", "b"]);

        restored.dispose();
        crate::home::set_soromi_home(None);
    }

    #[tokio::test]
    #[serial_test::serial]
    async fn set_resume_id_persists_for_the_tab() {
        let home = tempfile::tempdir().unwrap();
        crate::home::set_soromi_home(Some(home.path().to_path_buf()));
        let root = tempfile::tempdir().unwrap();

        let service = service();
        service
            .create_space(CreateSpaceInput {
                name: "kazomi".into(),
                root: root.path().to_string_lossy().into_owned(),
                agent: "/bin/cat".into(),
                account: "personal".into(),
                folders: None,
            })
            .unwrap();
        let session = service.summaries()[0].sessions[0].id.clone();

        service.set_resume_id(&session, "conv-123".into());

        // It is persisted against that tab, so a restart could resume it.
        let spaces = crate::workspaces::space_store::load_spaces();
        let stored = &spaces[0].sessions[0];
        assert_eq!(stored.id, session);
        assert_eq!(stored.resume_id.as_deref(), Some("conv-123"));

        service.dispose();
        crate::home::set_soromi_home(None);
    }

    #[tokio::test]
    #[serial_test::serial]
    async fn opens_closes_and_restores_sessions() {
        let home = tempfile::tempdir().unwrap();
        crate::home::set_soromi_home(Some(home.path().to_path_buf()));
        let root = tempfile::tempdir().unwrap();

        let hub = service();
        hub.create_space(CreateSpaceInput {
            name: "kazomi".into(),
            root: root.path().to_string_lossy().into_owned(),
            agent: "/bin/cat".into(),
            account: "personal".into(),
            folders: None,
        })
        .unwrap();

        // A second tab, same agent, no explicit account (resolves the existing binding).
        hub.open_session("kazomi", "/bin/cat".into(), None).unwrap();
        assert_eq!(hub.summaries()[0].sessions.len(), 2);
        hub.dispose();

        // Persisted, so a fresh service restores both tabs.
        let restored = service();
        assert_eq!(restored.summaries()[0].sessions.len(), 2);

        let first = restored.summaries()[0].sessions[0].id.clone();
        restored.close_session(&first);
        assert_eq!(restored.summaries()[0].sessions.len(), 1);

        restored.dispose();
        crate::home::set_soromi_home(None);
    }

    #[tokio::test]
    #[serial_test::serial]
    async fn migrates_legacy_single_agent_space() {
        let home = tempfile::tempdir().unwrap();
        crate::home::set_soromi_home(Some(home.path().to_path_buf()));
        let root = tempfile::tempdir().unwrap();
        let legacy = format!(
            r#"[{{"name":"kazomi","folders":["."],"agent":"/bin/cat","account":"personal","root":"{}"}}]"#,
            root.path().to_string_lossy()
        );
        std::fs::write(home.path().join("spaces.json"), legacy).unwrap();

        let service = service();
        let summaries = service.summaries();
        assert_eq!(summaries[0].accounts.len(), 1);
        assert_eq!(summaries[0].accounts[0].id, "personal");
        assert_eq!(summaries[0].accounts[0].agent, "/bin/cat");
        assert_eq!(summaries[0].sessions.len(), 1);
        assert_eq!(summaries[0].sessions[0].agent, "/bin/cat");

        service.dispose();
        crate::home::set_soromi_home(None);
    }

    #[test]
    fn session_dirs_runs_at_the_picked_folders_not_the_root() {
        // Whole folder: run at the root, no extra dirs.
        assert_eq!(
            session_dirs("/a", &[".".into()]),
            ("/a".to_string(), Vec::<String>::new())
        );
        // Several folders: cwd is the first, the rest are extra working dirs (absolute).
        assert_eq!(
            session_dirs("/a", &["api".into(), "web".into()]),
            ("/a/api".to_string(), vec!["/a/web".to_string()])
        );
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

    #[test]
    fn listing_dir_picks_the_directory_to_watch() {
        // Whole-root space: the empty listing reads the root itself.
        assert_eq!(
            listing_dir("/w", &[".".into()], ""),
            Some(PathBuf::from("/w"))
        );
        // A subpath reads that directory.
        assert_eq!(
            listing_dir("/w", &[".".into()], "src"),
            Some(PathBuf::from("/w/src"))
        );
        assert_eq!(
            listing_dir("/w", &["api".into(), "web".into()], "api/src"),
            Some(PathBuf::from("/w/api/src"))
        );
        // Multi-folder root listing is just the declared folders, not one on-disk dir.
        assert_eq!(listing_dir("/w", &["api".into(), "web".into()], ""), None);
        // Escapes are rejected (never watched).
        assert_eq!(listing_dir("/w", &[".".into()], "../etc"), None);
    }

    #[tokio::test]
    #[serial_test::serial]
    async fn rejects_a_missing_root() {
        let home = tempfile::tempdir().unwrap();
        crate::home::set_soromi_home(Some(home.path().to_path_buf()));
        let service = service();
        let result = service.create_space(CreateSpaceInput {
            name: "x".into(),
            root: "/no/such/folder".into(),
            agent: "/bin/cat".into(),
            account: "personal".into(),
            folders: None,
        });
        assert!(result.is_err());
        crate::home::set_soromi_home(None);
    }
}
