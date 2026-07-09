use std::fs;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};

use soromi_protocol::{
    AgentAccount, DirEntry, KeepAwakeMode, SessionSummary, Status, WorkspaceSummary,
};
use tokio::sync::broadcast;

use crate::accounts::loader::{accounts_dir, load_account_profile};
use crate::accounts::resolver::{expand_home, resolve_launch_env};
use crate::files::directory::list_directory;
use crate::files::reader::{FileRead, read_file_within};
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
}

impl WorkspaceService {
    /// Must be called within a tokio runtime: restoring spaces spawns their status watchers.
    pub fn new(
        notifications: Arc<NotificationController>,
        keep_awake: Arc<KeepAwakeController>,
        sound: Arc<dyn SoundPlayer>,
        launch_path: Option<String>,
    ) -> Arc<Self> {
        let (change_tx, _) = broadcast::channel(64);
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

    /// Sets whether the app window is focused. While focused, agent-event sounds and banners are
    /// suppressed; they fire only when the user is away from the app.
    pub fn set_focused(&self, focused: bool) {
        self.focused.store(focused, Ordering::Relaxed);
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
            })
            .collect();
        if sessions.is_empty() {
            sessions.push(SessionSpec {
                id: new_session_id(),
                agent: "claude".to_string(),
                title: None,
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
        match command {
            "claude" => {
                let dir = provider_config_dir(&account, "claude", "CLAUDE_CONFIG_DIR", ".claude");
                crate::skills::claude_skills(&dir, &project_roots)
            }
            "codex" => {
                let dir = provider_config_dir(&account, "codex", "CODEX_HOME", ".codex");
                crate::skills::codex_skills(&dir, &project_roots)
            }
            _ => Vec::new(),
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
        accounts: Vec<AgentAccount>,
        folders: Vec<String>,
        instructions: Option<String>,
    ) -> anyhow::Result<OpenResult> {
        let folders = if folders.is_empty() {
            vec![".".to_string()]
        } else {
            folders
        };
        let instructions = instructions.filter(|text| !text.trim().is_empty());
        let (root, sessions, old_accounts) = {
            let metadata = self.metadata.lock().unwrap();
            let (_, meta) = metadata
                .iter()
                .find(|(n, _)| n == name)
                .ok_or_else(|| anyhow::anyhow!("workspace not found: {name}"))?;
            (
                meta.root.clone(),
                meta.sessions.clone(),
                meta.accounts.clone(),
            )
        };
        if let Some((_, meta)) = self
            .metadata
            .lock()
            .unwrap()
            .iter_mut()
            .find(|(n, _)| n == name)
        {
            meta.accounts = accounts.clone();
            meta.folders = folders.clone();
            meta.instructions = instructions.clone();
        }
        let mut warning = None;
        for session in &sessions {
            if account_for(&old_accounts, &session.agent) != account_for(&accounts, &session.agent)
            {
                self.manager.dispose(&session.id);
                warning = warning.or(self.start_session(
                    name,
                    &root,
                    &folders,
                    &accounts,
                    instructions.as_deref(),
                    session,
                ));
            }
        }
        self.persist();
        self.emit_change();
        Ok(OpenResult {
            workspace: name.to_string(),
            warning,
        })
    }

    /// Spawns each of a space's sessions, wires their status watchers, and records its metadata.
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
        let mut args = parsed.args;
        if let Some(flag) = crate::config::add_dir_flag(command) {
            for dir in &extra_dirs {
                args.push(flag.to_string());
                args.push(dir.clone());
            }
        }
        // Append the workspace instructions to the agent's system prompt, when it has a flag for
        // it (Claude does; Codex does not, so its sessions run without them).
        if let Some(text) = instructions.map(str::trim).filter(|t| !t.is_empty())
            && let Some(flag) = crate::config::system_prompt_flag(command)
        {
            args.push(flag.to_string());
            args.push(text.to_string());
        }

        let account = account_for(accounts, &session.agent);
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
        match basename(&parsed.command) {
            "claude" => {
                let config_dir = config_dir_from(&env, "CLAUDE_CONFIG_DIR", ".claude");
                let _ = crate::hooks::ensure_claude_hooks(&config_dir);
            }
            "codex" => {
                let config_dir = config_dir_from(&env, "CODEX_HOME", ".codex");
                // `notify` (no trust) covers complete; the hook (needs `/hooks` trust) adds request.
                let _ = crate::hooks::ensure_codex_notify(&config_dir);
                let _ = crate::hooks::ensure_codex_hooks(&config_dir);
            }
            _ => {}
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
fn provider_config_dir(account: &str, provider: &str, env_var: &str, default: &str) -> PathBuf {
    if let Ok(profile) = load_account_profile(account, &accounts_dir())
        && let Some(dir) = profile
            .providers
            .get(provider)
            .and_then(|provider| provider.config_dir.as_ref())
    {
        let home = dirs::home_dir()
            .unwrap_or_default()
            .to_string_lossy()
            .into_owned();
        return PathBuf::from(expand_home(dir, &home));
    }
    std::env::var(env_var)
        .map(PathBuf::from)
        .unwrap_or_else(|_| dirs::home_dir().unwrap_or_default().join(default))
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
            .update_space("kazomi", accounts, vec!["api".into()], None)
            .unwrap();

        assert_eq!(service.summaries()[0].folders, vec!["api".to_string()]);

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
