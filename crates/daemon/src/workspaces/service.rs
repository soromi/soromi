use std::collections::HashMap;
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};

use soromi_protocol::{
    AgentAccount, DirEntry, KeepAwakeMode, PermissionMode, SessionMode, SessionSummary, Status,
    SubAgent, ToolKind, WorkspaceSummary,
};
use tokio::sync::broadcast;

use crate::accounts::loader::{accounts_dir, load_account_profile};
use crate::accounts::resolver::{expand_home, resolve_launch_env};
use crate::files::directory::list_directory;
use crate::files::paths::resolve_within;
use crate::files::reader::{FileRead, read_file_within, write_file_within};
use crate::files::watcher::DirectoryWatcher;
use crate::home::soromi_home;
use crate::keep_awake::controller::KeepAwakeController;
use crate::notifications::controller::{Audience, NotificationController};
use crate::sessions::chat::ChatSession;
use crate::sessions::exec_chat::ExecChatSession;
use crate::sessions::manager::SessionManager;
use crate::sessions::session::{Session, SessionOptions};
use crate::sessions::stream_json::StreamJsonSession;
use crate::sound::player::{Cue, SoundPlayer, cue_for};
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

/// What changed, so a viewport is told only that. Sent on the hub's change channel.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Change {
    /// The set of workspaces or sessions, or their saved settings: the whole list is stale.
    Structure,
    /// One session's live state (status, activity, sub-agents, context usage).
    Session(String),
    /// App-wide state outside the workspace list (keep-awake, an available update).
    Global,
}

/// A viewport attached to the daemon: the desktop app, or one of a paired device's links.
struct Viewer {
    id: u64,
    /// Shown to the other viewports while this one is in control.
    name: String,
    /// The paired device this is a link of, if it is one.
    device: Option<String>,
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
    change_tx: broadcast::Sender<Change>,
    /// A newer release than the running build, once the update check finds one.
    update: Mutex<Option<UpdateInfo>>,
    /// Whether the app window is focused. While it is, agent-event sounds and banners are
    /// suppressed here (the user is already looking at the app). Set by the shell; false by default,
    /// so the standalone daemon always fires. Shared (`Arc`) so background status watchers can read
    /// it from their own tasks.
    focused: Arc<AtomicBool>,
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
    /// Attached viewports, in join order, for control transfer + the takeover label.
    viewers: Mutex<Vec<Viewer>>,
    /// The paired device whose last link left while it was in control. Control went to another
    /// viewport so nothing was left undriven, and goes back when the device returns, however long
    /// that takes: a phone's app is cut off whenever it is put behind another one, and coming back
    /// to it is not a reason to have lost the sessions it was driving. It stops being owed once
    /// someone else drives (see [`Self::drives`]) or takes control.
    control_owed: Mutex<Option<String>>,
    /// Fires when control changes, so each viewport re-derives its own control state.
    control_tx: broadcast::Sender<()>,
    /// The last thing each session did, read from its transcript once on startup (keyed by session
    /// id). It's the subtitle a restored-but-not-yet-attached tab shows, so an old conversation reads
    /// as its last activity instead of "New session". A live tab's own activity takes precedence.
    restored_activity: Mutex<HashMap<String, String>>,
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
            focused: Arc::new(AtomicBool::new(false)),
            launch_path,
            watcher,
            dir_change_tx,
            reset_tx,
            usage_cache: Mutex::new(HashMap::new()),
            controller: Mutex::new(None),
            viewers: Mutex::new(Vec::new()),
            control_owed: Mutex::new(None),
            control_tx: broadcast::channel(64).0,
            restored_activity: Mutex::new(HashMap::new()),
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
            // Lazy restore: register the tabs (so the sidebar shows them with their last activity),
            // but don't spawn a `claude` process per tab. Each backend is started on first attach
            // (`ensure_session`) - opening one tab shouldn't launch every other tab's agent.
            service.register_space(space);
        }
        // Persist once if any space was migrated or had folders that no longer exist on disk.
        if dirty {
            service.persist();
        }
        // Off the startup path, read each restored tab's last transcript activity so the sidebar
        // shows what it was doing rather than "New session"; refresh the rail once it's ready.
        let seeded = service.clone();
        tokio::spawn(async move {
            seeded.seed_restored_activity();
            seeded.emit_change();
        });
        service
    }

    /// Populates `restored_activity` by reading the tail of each session's transcript. Best-effort:
    /// a missing/unreadable transcript is simply skipped (that tab keeps the "New session" subtitle).
    fn seed_restored_activity(&self) {
        // Snapshot what we need under the lock, then do the file reads without holding it.
        #[allow(clippy::type_complexity)]
        let sessions: Vec<(String, String, String, String, Vec<String>, String)> = {
            let metadata = self.metadata.lock().unwrap();
            metadata
                .iter()
                .flat_map(|(_, meta)| {
                    meta.sessions.iter().map(|spec| {
                        (
                            spec.id.clone(),
                            spec.agent.clone(),
                            spec.resume_id.clone().unwrap_or_else(|| spec.id.clone()),
                            meta.root.clone(),
                            meta.folders.clone(),
                            session_account(&meta.accounts, spec),
                        )
                    })
                })
                .collect()
        };

        for (id, agent, convo_id, root, folders, account) in sessions {
            let full_command = parse_agent_command(&agent)
                .map(|p| p.command)
                .unwrap_or_default();
            let Some(provider) = crate::providers::provider(basename(&full_command)) else {
                continue;
            };
            let config_dir = provider_config_dir(&account, provider);
            let (cwd, _) = session_dirs(&root, &folders);
            let Some(path) = provider
                .transcript_path(&config_dir, &cwd, &convo_id)
                .filter(|p| p.exists())
            else {
                continue;
            };
            if let Some(activity) = last_transcript_activity(&path, provider) {
                self.restored_activity.lock().unwrap().insert(id, activity);
            }
        }
    }

    pub fn subscribe_changes(&self) -> broadcast::Receiver<Change> {
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
        self.add_viewer(Viewer {
            id,
            name,
            device: None,
        });
    }

    /// Registers a viewport that is one of a paired device's links. A device can reach the daemon
    /// by more than one route (the relay, a direct socket) and moves between them as its network
    /// changes; its links are told apart from other viewports so control can follow the device
    /// (see [`Self::follow_device`]).
    pub fn register_device_viewer(&self, id: u64, name: String, device: &str) {
        self.add_viewer(Viewer {
            id,
            name,
            device: Some(device.to_string()),
        });
    }

    fn add_viewer(&self, viewer: Viewer) {
        {
            let mut viewers = self.viewers.lock().unwrap();
            let id = viewer.id;
            viewers.retain(|other| other.id != id);
            viewers.push(viewer);
            let mut controller = self.controller.lock().unwrap();
            if controller.is_none() {
                *controller = Some(id);
            }
        }
        let _ = self.control_tx.send(());
    }

    /// A paired device has started talking through this viewport's link. Control moves here if it
    /// is held by another link of the same device (the route it was on a moment ago), or if the
    /// device held it when its last link dropped and nobody has driven or claimed it since: to the
    /// user it is one phone, whichever way it is connected, and neither a change of network nor a
    /// while spent in another app is a reason to lose the session it was driving. Control held by
    /// anything else stays put.
    pub fn follow_device(&self, id: u64) {
        let moved = {
            let viewers = self.viewers.lock().unwrap();
            let mut controller = self.controller.lock().unwrap();
            let mut owed = self.control_owed.lock().unwrap();
            let device = |viewer: u64| {
                viewers
                    .iter()
                    .find(|other| other.id == viewer)
                    .and_then(|other| other.device.as_deref())
            };
            let Some(mine) = device(id) else {
                return;
            };
            let sibling_holds =
                matches!(*controller, Some(holder) if holder != id && device(holder) == Some(mine));
            let is_owed = owed.as_deref() == Some(mine);
            if is_owed {
                *owed = None;
            }
            if (sibling_holds || is_owed) && *controller != Some(id) {
                *controller = Some(id);
                true
            } else {
                false
            }
        };
        if moved {
            let _ = self.control_tx.send(());
        }
    }

    /// Unregisters a viewport. If it held control, control passes to another link of the same
    /// device when there is one (the device only changed route), and otherwise to the viewport
    /// that has been attached longest. A device that leaves this way is owed control back.
    pub fn unregister_viewer(&self, id: u64) {
        {
            let mut viewers = self.viewers.lock().unwrap();
            let device = viewers
                .iter()
                .find(|viewer| viewer.id == id)
                .and_then(|viewer| viewer.device.clone());
            viewers.retain(|viewer| viewer.id != id);
            let mut controller = self.controller.lock().unwrap();
            if *controller == Some(id) {
                let sibling = device.as_deref().and_then(|device| {
                    viewers
                        .iter()
                        .rev()
                        .find(|viewer| viewer.device.as_deref() == Some(device))
                });
                if sibling.is_none()
                    && let Some(device) = device
                {
                    *self.control_owed.lock().unwrap() = Some(device);
                }
                *controller = sibling.or(viewers.first()).map(|viewer| viewer.id);
            }
        }
        let _ = self.control_tx.send(());
    }

    /// Hands sole terminal control to a viewport (its "Take control" action).
    pub fn take_control(&self, id: u64) {
        *self.controller.lock().unwrap() = Some(id);
        // Someone chose who drives: nothing is owed to whoever drove before.
        *self.control_owed.lock().unwrap() = None;
        let _ = self.control_tx.send(());
    }

    /// Whether a viewport currently controls the terminals (drives input / owns the size).
    pub fn is_controller(&self, id: u64) -> bool {
        *self.controller.lock().unwrap() == Some(id)
    }

    /// Whether a viewport may act on the sessions, asked as it does so: typing, sending a message,
    /// answering an approval. Acting is what settles who drives. A viewport that was only standing
    /// in for a device that dropped off keeps control from then on, and the device is owed nothing
    /// when it comes back. Sizing a terminal is not asked through here: a viewport does that by
    /// being on screen, not by anyone's choice.
    pub fn drives(&self, id: u64) -> bool {
        if !self.is_controller(id) {
            return false;
        }
        *self.control_owed.lock().unwrap() = None;
        true
    }

    /// The controlling viewport's display name (for a viewport that is not itself the controller).
    pub fn controller_name(&self) -> Option<String> {
        let controller = (*self.controller.lock().unwrap())?;
        let viewers = self.viewers.lock().unwrap();
        viewers
            .iter()
            .find(|viewer| viewer.id == controller)
            .map(|viewer| viewer.name.clone())
    }

    /// Sets whether the app window is focused. While focused, agent-event sounds and banners are
    /// suppressed on this computer; they fire only when the user is away from the app. A paired
    /// device is told either way.
    pub fn set_focused(&self, focused: bool) {
        self.focused.store(focused, Ordering::Relaxed);
    }

    /// Subscribes a viewer that shows notification banners itself. The Electron shell: while it is
    /// subscribed, the daemon routes this computer's banners to it as `Notify` messages instead of
    /// firing them via the OS. A paired device (`device`): it gets every banner, whether or not
    /// someone is looking at the app on the computer.
    pub fn subscribe_notifications(
        &self,
        device: bool,
    ) -> tokio::sync::broadcast::Receiver<crate::notifications::controller::WireNotification> {
        if device {
            self.notifications.subscribe_devices()
        } else {
            self.notifications.subscribe_wire()
        }
    }

    /// The devices that take pushed banners (see [`crate::notifications::push`]).
    pub fn push(&self) -> Arc<crate::notifications::push::PushService> {
        self.notifications.push()
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

    /// Points a live session's chat view at its agent transcript, so the daemon tails it into
    /// structured chat events. No-op if the session isn't live (yet).
    pub fn set_transcript(&self, session_id: &str, path: std::path::PathBuf) {
        if let Some(session) = self.get(session_id) {
            session.start_transcript(path);
        }
    }

    /// Records an available update and wakes viewports so they can show the banner.
    pub fn set_update(&self, info: UpdateInfo) {
        *self.update.lock().unwrap() = Some(info);
        self.emit_global();
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
                account: None,
                id: new_session_id(),
                agent: input.agent,
                title: None,
                resume_id: None,
                mode: SessionMode::Terminal,
                permission_mode: PermissionMode::default(),
                model: None,
                effort: None,
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
                account: None,
                id: new_session_id(),
                agent: a.agent.clone(),
                title: None,
                resume_id: None,
                mode: SessionMode::Terminal,
                permission_mode: PermissionMode::default(),
                model: None,
                effort: None,
            })
            .collect();
        if sessions.is_empty() {
            sessions.push(SessionSpec {
                account: None,
                id: new_session_id(),
                agent: "claude".to_string(),
                title: None,
                resume_id: None,
                mode: SessionMode::Terminal,
                permission_mode: PermissionMode::default(),
                model: None,
                effort: None,
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
        mode: SessionMode,
    ) -> anyhow::Result<SessionSummary> {
        let mut session = SessionSpec {
            account: None,
            id: new_session_id(),
            agent: agent.clone(),
            title: None,
            // Fresh tab; its resume_id is captured from the agent's session-start hook.
            resume_id: None,
            mode,
            permission_mode: PermissionMode::default(),
            model: None,
            effort: None,
        };
        let (root, folders, accounts, instructions) = {
            let mut metadata = self.metadata.lock().unwrap();
            let (_, meta) = metadata
                .iter_mut()
                .find(|(n, _)| n == workspace)
                .ok_or_else(|| anyhow::anyhow!("workspace not found: {workspace}"))?;
            // The first tab of an agent the workspace does not bind yet binds it; any other runs
            // under the account asked for, one of the workspace's for that agent.
            if !meta.accounts.iter().any(|a| a.agent == agent) {
                if let Some(id) = account {
                    meta.accounts.push(AgentAccount {
                        id,
                        agent: agent.clone(),
                    });
                }
            } else {
                session.account = pin_for(&meta.accounts, &agent, account);
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
        let account = session_account(&accounts, &session);
        Ok(SessionSummary {
            id: session.id,
            account,
            agent,
            status: Status::Idle,
            title: None,
            subagents: Vec::new(),
            activity: None,
            mode,
            permission_mode: PermissionMode::default(),
            model: None,
            effort: None,
            context_tokens: None,
        })
    }

    /// Switches a tab between the terminal and headless chat, keeping the same conversation. Flips the
    /// spec's mode, tears down the current backend, and starts it again in the new mode - which
    /// resumes the pinned conversation id (`--resume <id>`), so no history is lost.
    pub fn switch_mode(&self, session_id: &str, mode: SessionMode) {
        let ctx = {
            let mut metadata = self.metadata.lock().unwrap();
            let mut found = None;
            for (name, meta) in metadata.iter_mut() {
                if let Some(spec) = meta.sessions.iter_mut().find(|s| s.id == session_id) {
                    if spec.mode == mode {
                        return; // already in this mode
                    }
                    spec.mode = mode;
                    found = Some((
                        name.clone(),
                        spec.clone(),
                        meta.root.clone(),
                        meta.folders.clone(),
                        meta.accounts.clone(),
                        meta.instructions.clone(),
                    ));
                    break;
                }
            }
            found
        };
        let Some((workspace, spec, root, folders, accounts, instructions)) = ctx else {
            return;
        };
        // Tear down the current backend, then restart in the new mode (resumes the same conversation).
        self.manager.dispose(session_id);
        self.start_session(
            &workspace,
            &root,
            &folders,
            &accounts,
            instructions.as_deref(),
            &spec,
        );
        self.persist();
        self.emit_change();
    }

    /// Switches a tab to a different agent (e.g. Claude -> Codex). Rebinds the tab's `agent`, records
    /// the account binding for that agent if the workspace lacks one, and restarts the backend under
    /// the new agent. Providers don't share a transcript, so the conversation starts fresh: the
    /// pinned resume id and the provider-specific model/effort are cleared.
    pub fn set_session_agent(&self, session_id: &str, agent: String, account: Option<String>) {
        let ctx = {
            let mut metadata = self.metadata.lock().unwrap();
            let mut found = None;
            for (name, meta) in metadata.iter_mut() {
                let Some(spec) = meta.sessions.iter_mut().find(|s| s.id == session_id) else {
                    continue;
                };
                if spec.agent == agent {
                    // The same agent under another of the workspace's accounts for it. Each
                    // account keeps its own conversations, so this one cannot be resumed there:
                    // the session starts afresh, keeping its model.
                    let current = session_account(&meta.accounts, spec);
                    let Some(next) = account.clone().filter(|id| *id != current) else {
                        return; // already this agent, under this account
                    };
                    spec.account = pin_for(&meta.accounts, &agent, Some(next));
                    spec.resume_id = None;
                } else {
                    spec.agent = agent.clone();
                    // A different provider can't resume this conversation, and its model/effort
                    // aliases differ - start clean rather than carry over an invalid combination.
                    spec.resume_id = None;
                    spec.model = None;
                    spec.effort = None;
                    // Record the account binding for the new agent, so `start_session` (and later
                    // tabs) resolve it - exactly as `open_session` binds an agent the first time
                    // it's used. Bound already, the tab runs under the account asked for.
                    if !meta.accounts.iter().any(|a| a.agent == agent) {
                        if let Some(id) = account.clone() {
                            meta.accounts.push(AgentAccount {
                                id,
                                agent: agent.clone(),
                            });
                        }
                        spec.account = None;
                    } else {
                        spec.account = pin_for(&meta.accounts, &agent, account.clone());
                    }
                }
                found = Some((
                    name.clone(),
                    spec.clone(),
                    meta.root.clone(),
                    meta.folders.clone(),
                    meta.accounts.clone(),
                    meta.instructions.clone(),
                ));
                break;
            }
            found
        };
        let Some((workspace, spec, root, folders, accounts, instructions)) = ctx else {
            return;
        };
        self.manager.dispose(session_id);
        self.start_session(
            &workspace,
            &root,
            &folders,
            &accounts,
            instructions.as_deref(),
            &spec,
        );
        // Tell viewports following it: what they hold is the old agent's conversation.
        let _ = self.reset_tx.send(session_id.to_string());
        self.persist();
        self.emit_change();
    }

    /// Sets a chat tab's permission mode (the composer dropdown): persists it for the next launch and,
    /// if the headless session is running, applies it live over the control channel.
    pub fn set_permission_mode(&self, session_id: &str, mode: PermissionMode) {
        {
            let mut metadata = self.metadata.lock().unwrap();
            let Some(spec) = metadata
                .iter_mut()
                .flat_map(|(_, meta)| meta.sessions.iter_mut())
                .find(|s| s.id == session_id)
            else {
                return;
            };
            if spec.permission_mode == mode {
                return;
            }
            spec.permission_mode = mode;
        }
        if let Some(chat) = self.manager.get_chat(session_id) {
            tokio::spawn(async move { chat.set_permission_mode(mode).await });
        }
        self.persist();
        self.emit_change();
    }

    /// Sets a chat tab's model + reasoning effort (the composer's model dropdown): persists it for the
    /// next launch and, if the headless session is running, applies it live (`/model` / `/effort`).
    pub fn set_model(&self, session_id: &str, model: Option<String>, effort: Option<String>) {
        {
            let mut metadata = self.metadata.lock().unwrap();
            let Some(spec) = metadata
                .iter_mut()
                .flat_map(|(_, meta)| meta.sessions.iter_mut())
                .find(|s| s.id == session_id)
            else {
                return;
            };
            if spec.model == model && spec.effort == effort {
                return;
            }
            spec.model = model.clone();
            spec.effort = effort.clone();
        }
        if let Some(chat) = self.manager.get_chat(session_id) {
            tokio::spawn(async move {
                chat.set_model(model.as_deref(), effort.as_deref()).await;
            });
        }
        self.persist();
        self.emit_change();
    }

    /// Runs a bare slash command in a chat session (`/compact`, `/clear`, …) — the composer's context
    /// controls. Sent to the agent as a command, not recorded as a user message.
    pub fn run_chat_command(&self, session_id: &str, command: String) {
        if let Some(chat) = self.manager.get_chat(session_id) {
            tokio::spawn(async move { chat.run_command(&command).await });
        }
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

    /// Returns a live PTY terminal session by its id.
    pub fn get(&self, id: &str) -> Option<Arc<Session>> {
        self.manager.get(id)
    }

    /// Returns a live headless chat session by its id.
    pub fn get_chat(&self, id: &str) -> Option<Arc<ChatSession>> {
        self.manager.get_chat(id)
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
                    .map(|session| self.session_summary(meta, session))
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

    /// One session's current summary with its workspace's name and aggregate status — what a
    /// viewport needs when only that session changed. `None` if the session no longer exists.
    pub fn session_update(&self, session_id: &str) -> Option<(String, Status, SessionSummary)> {
        let metadata = self.metadata.lock().unwrap();
        let (name, meta) = metadata
            .iter()
            .find(|(_, meta)| meta.sessions.iter().any(|s| s.id == session_id))?;
        let sessions: Vec<SessionSummary> = meta
            .sessions
            .iter()
            .map(|session| self.session_summary(meta, session))
            .collect();
        let status = aggregate_status(&sessions);
        let summary = sessions.into_iter().find(|s| s.id == session_id)?;
        Some((name.clone(), status, summary))
    }

    /// Builds a session's summary from its saved spec plus whatever its live backend reports.
    fn session_summary(&self, meta: &WorkspaceMeta, session: &SessionSpec) -> SessionSummary {
        let live = self.manager.get(&session.id);
        let live_chat = self.manager.get_chat(&session.id);
        SessionSummary {
            id: session.id.clone(),
            agent: session.agent.clone(),
            account: session_account(&meta.accounts, session),
            status: live
                .as_ref()
                .map(|s| s.status())
                .or_else(|| live_chat.as_ref().map(|s| s.status()))
                .unwrap_or(Status::Idle),
            title: session.title.clone(),
            subagents: live
                .as_ref()
                .map(|s| s.subagents())
                .or_else(|| live_chat.as_ref().map(|s| s.subagents()))
                .unwrap_or_default(),
            // Live activity wins; otherwise a restored tab shows its last transcript activity so it
            // doesn't read as "New session".
            activity: live.as_ref().and_then(|s| s.activity()).or_else(|| {
                self.restored_activity
                    .lock()
                    .unwrap()
                    .get(&session.id)
                    .cloned()
            }),
            mode: session.mode,
            permission_mode: session.permission_mode,
            model: session.model.clone(),
            effort: session.effort.clone(),
            context_tokens: live_chat.as_ref().and_then(|s| s.context_tokens()),
        }
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

    pub fn read_file(&self, workspace: &str, path: &str, image_limit: u64) -> FileRead {
        let metadata = self.metadata.lock().unwrap();
        match metadata.iter().find(|(name, _)| name == workspace) {
            Some((_, meta)) => read_file_within(Path::new(&meta.root), path, image_limit),
            None => FileRead {
                content: String::new(),
                truncated: false,
                binary: false,
                image: None,
            },
        }
    }

    /// Saves an edited file back to disk (the file editor), guarding against path escapes.
    pub fn write_file(&self, workspace: &str, path: &str, content: &str) -> anyhow::Result<()> {
        let root = {
            let metadata = self.metadata.lock().unwrap();
            metadata
                .iter()
                .find(|(name, _)| name == workspace)
                .map(|(_, meta)| meta.root.clone())
        };
        let Some(root) = root else {
            anyhow::bail!("workspace not found: {workspace}");
        };
        write_file_within(Path::new(&root), path, content)?;
        Ok(())
    }

    /// Moves a file or folder of a workspace to the Trash (the tree's "Move to Trash").
    pub fn trash_path(&self, workspace: &str, path: &str) -> anyhow::Result<()> {
        let found = {
            let metadata = self.metadata.lock().unwrap();
            metadata
                .iter()
                .find(|(name, _)| name == workspace)
                .map(|(_, meta)| (meta.root.clone(), meta.folders.clone()))
        };
        let Some((root, folders)) = found else {
            anyhow::bail!("workspace not found: {workspace}");
        };
        crate::files::reader::trash_within(Path::new(&root), path, &folders)?;
        Ok(())
    }

    /// The git working-tree status for a workspace (read-only source-control view). Falls back to an
    /// empty non-repo status when the workspace is unknown.
    pub fn git_status(&self, workspace: &str, folder: &str) -> soromi_protocol::GitStatusInfo {
        match self.workspace_dir(workspace, folder) {
            Some(dir) => crate::files::git::status(&dir),
            None => soromi_protocol::GitStatusInfo {
                is_repo: false,
                branch: None,
                ahead: 0,
                behind: 0,
                changes: Vec::new(),
            },
        }
    }

    /// The unified diff for one changed file. Returns `(patch, truncated)`; empty for an unknown
    /// workspace.
    pub fn git_diff(
        &self,
        workspace: &str,
        folder: &str,
        path: &str,
        staged: bool,
    ) -> (String, bool) {
        match self.workspace_dir(workspace, folder) {
            Some(dir) => crate::files::git::diff(&dir, path, staged),
            None => (String::new(), false),
        }
    }

    /// The folders of a workspace that are git repositories, relative to its root ("" = the root
    /// itself), the root first. A workspace is often a folder of several repositories, where the
    /// root has no status of its own: these are what a viewport offers to look at instead.
    pub fn git_repos(&self, workspace: &str) -> Vec<String> {
        let found = {
            let metadata = self.metadata.lock().unwrap();
            metadata
                .iter()
                .find(|(name, _)| name == workspace)
                .map(|(_, meta)| (meta.root.clone(), meta.folders.clone()))
        };
        match found {
            Some((root, folders)) => crate::files::git::repos(Path::new(&root), &folders),
            None => Vec::new(),
        }
    }

    /// The directory a workspace-relative `folder` names ("" or "." = the root), or `None` for an
    /// unknown workspace or a folder that would lead out of it.
    fn workspace_dir(&self, workspace: &str, folder: &str) -> Option<std::path::PathBuf> {
        let root = self.workspace_root(workspace)?;
        crate::files::git::inside(Path::new(&root), folder)
    }

    /// Spawns an ad-hoc shell PTY for a workspace, rooted at `folder` (relative to the workspace root;
    /// "" or "." = the root). Not persisted and not a workspace tab — a bare user shell keyed by
    /// `shell_id` in the session manager, so Attach/Input/Resize/Output/CloseSession all reuse it by
    /// id. The command is `$SHELL` with an unknown provider, so `Session::spawn` runs a raw terminal.
    pub fn open_shell(&self, workspace: &str, shell_id: &str, folder: &str) -> anyhow::Result<()> {
        let root = self
            .workspace_root(workspace)
            .ok_or_else(|| anyhow::anyhow!("workspace not found: {workspace}"))?;
        let cwd = if folder.is_empty() || folder == "." {
            root.clone()
        } else {
            Path::new(&root).join(folder).to_string_lossy().into_owned()
        };
        // A login+interactive shell, so it sources the user's rc files and prints a prompt. Fall back
        // to a common shell when $SHELL is absent (a GUI-launched daemon may have a minimal env).
        let shell = std::env::var("SHELL").unwrap_or_else(|_| "/bin/zsh".into());
        let options = SessionOptions {
            agent: "shell".into(),
            command: shell,
            args: vec!["-l".into(), "-i".into()],
            cwd,
            env: None,
            cols: 80,
            rows: 24,
        };
        self.manager.ensure(shell_id, options)?;
        Ok(())
    }

    /// The on-disk root of a workspace, if it exists.
    fn workspace_root(&self, workspace: &str) -> Option<String> {
        let metadata = self.metadata.lock().unwrap();
        metadata
            .iter()
            .find(|(name, _)| name == workspace)
            .map(|(_, meta)| meta.root.clone())
    }

    /// Lists the slash commands and skills available to a session's agent (Claude only for now).
    pub fn list_skills(&self, session_id: &str) -> Vec<soromi_protocol::Skill> {
        let resolved = {
            let metadata = self.metadata.lock().unwrap();
            metadata.iter().find_map(|(_, meta)| {
                meta.sessions.iter().find(|s| s.id == session_id).map(|s| {
                    (
                        s.agent.clone(),
                        session_account(&meta.accounts, s),
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
                let account = session_account(&meta.accounts, session);
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
        self.emit_global();
    }

    /// A paired device connected, or the last one has been gone a while: the machine is held awake
    /// for as long as one is there, whatever the keep-awake mode (see `KeepAwakeController`).
    pub fn set_device_connected(&self, connected: bool) {
        if self.keep_awake.set_device(connected) {
            self.emit_global();
        }
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
            // A tab pinned to an account the workspace no longer binds for its agent goes back to
            // the workspace's first.
            for spec in &mut meta.sessions {
                let bound = |id: &String| {
                    accounts
                        .iter()
                        .any(|a| a.agent == spec.agent && a.id == *id)
                };
                if spec.account.as_ref().is_some_and(|id| !bound(id)) {
                    spec.account = None;
                    spec.resume_id = None;
                }
            }
        }
        let sessions_after: Vec<SessionSpec> = self
            .metadata
            .lock()
            .unwrap()
            .iter()
            .find(|(n, _)| n == name)
            .map(|(_, meta)| meta.sessions.clone())
            .unwrap_or_default();
        let mut warning = None;
        for (session, after) in sessions.iter().zip(&sessions_after) {
            let account_changed =
                session_account(&old_accounts, session) != session_account(&accounts, after);
            if account_changed || folders_changed {
                self.manager.dispose(&session.id);
                warning = warning.or(self.start_session(
                    name,
                    &root,
                    &folders,
                    &accounts,
                    instructions.as_deref(),
                    after,
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
        self.register_space(space);
        warning
    }

    /// Records a space's metadata (name, folders, accounts, tabs) without spawning any of its
    /// sessions. Used by the lazy startup restore; `spawn_space` calls it after starting the tabs.
    fn register_space(&self, space: PersistedSpace) {
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
    }

    /// Starts a restored tab's backend the first time it's attached (lazy restore). Restored tabs
    /// are registered without a running process; this spawns one on demand from the tab's persisted
    /// spec. A no-op when the session is already live (or unknown), so re-attaching is cheap.
    pub fn ensure_session(&self, session_id: &str) {
        if self.manager.get(session_id).is_some() || self.manager.get_chat(session_id).is_some() {
            return;
        }
        let ctx = {
            let metadata = self.metadata.lock().unwrap();
            metadata.iter().find_map(|(name, meta)| {
                meta.sessions
                    .iter()
                    .find(|s| s.id == session_id)
                    .map(|spec| {
                        (
                            name.clone(),
                            spec.clone(),
                            meta.root.clone(),
                            meta.folders.clone(),
                            meta.accounts.clone(),
                            meta.instructions.clone(),
                        )
                    })
            })
        };
        let Some((workspace, spec, root, folders, accounts, instructions)) = ctx else {
            return;
        };
        self.start_session(
            &workspace,
            &root,
            &folders,
            &accounts,
            instructions.as_deref(),
            &spec,
        );
        self.emit_change();
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
        let account = session_account(accounts, session);
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
            // Pin the conversation to a Soromi-owned id so a mode switch (terminal <-> chat) always
            // resumes the *same* conversation, no matter what. New sessions use their own `session.id`
            // as the conversation id; pre-existing tabs keep the id captured from their first run (so
            // history isn't orphaned). When the transcript already exists we `--resume` it; otherwise
            // we start it fresh with our pinned id via `--session-id`. A provider that can't pin
            // (no `--session-id`) or can't resume no-ops both and just starts fresh.
            let convo_id = session
                .resume_id
                .clone()
                .unwrap_or_else(|| session.id.clone());
            let config_dir = provider_config_dir(&account, provider);
            // Only resume an id the agent would recognize: a captured `resume_id`, or our `session.id`
            // when the provider pinned it. A provider that can't pin (Codex) must not be handed our
            // `session.id` — it was never a conversation there, so `resume <that>` errors; start fresh
            // and let its first turn's hook capture the real id for next time.
            let resumable = session.resume_id.is_some() || provider.can_pin_session_id();
            if resumable && provider.resume_available(&config_dir, &cwd, &convo_id) {
                provider.apply_resume(&mut args, &convo_id);
            } else {
                provider.apply_session_id(&mut args, &convo_id);
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

        // Headless "chat" mode, per-turn backend (Codex): each turn is its own `codex exec` process,
        // so there's no persistent launch here — the session builds each turn's command from the
        // provider. Runs before the stream-json branch since Codex has no `headless_stream_json_args`.
        if session.mode == SessionMode::Chat
            && let Some(provider) = provider
            && provider.chat_is_per_turn()
        {
            let program = parsed.command.clone();
            let resume_id = session.resume_id.clone();
            let cwd = cwd.clone();
            let env = env.clone();
            let id = session.id.clone();
            let permission_mode = session.permission_mode;
            let model = session.model.clone();
            let effort = session.effort.clone();
            let spawned = self.manager.ensure_chat(&session.id, move || {
                Ok(ChatSession::Exec(ExecChatSession::spawn(
                    provider,
                    &program,
                    &cwd,
                    Some(&env),
                    Vec::new(),
                    resume_id,
                    permission_mode,
                    model,
                    effort,
                )?))
            });
            if let Ok(sess) = spawned {
                self.watch_chat(workspace, &id, &sess);
            }
            return warning;
        }

        // Headless "chat" mode, persistent stream-json backend (Claude): one long-lived process. The
        // base flags go in front of the shared args (add-dir / system-prompt / session-id/resume).
        // A provider with neither backend falls through to the terminal.
        if session.mode == SessionMode::Chat
            && let Some(provider) = provider
            && let Some(base) = provider.headless_stream_json_args()
        {
            let mut chat_args = base;
            // The persisted permission mode (the composer dropdown's choice) — the initial
            // `--permission-mode`; changed live thereafter via `set_permission_mode`.
            if let Some(flag) = provider.permission_flag(session.permission_mode) {
                chat_args.push("--permission-mode".to_string());
                chat_args.push(flag);
            }
            // The persisted model + effort (the composer's model dropdown), changed live thereafter
            // via `set_model`. Absent = the provider default.
            if let Some(model) = &session.model {
                chat_args.push("--model".to_string());
                chat_args.push(model.clone());
            }
            if let Some(effort) = &session.effort {
                chat_args.push("--effort".to_string());
                chat_args.push(effort.clone());
            }
            chat_args.extend(args.iter().cloned());
            let program = parsed.command.clone();
            // Seed the chat log from the prior conversation's transcript so a resumed tab (e.g. one
            // switched over from a live terminal) shows its history right away — the CLI does not
            // replay it on stdout when resuming.
            let convo_id = session
                .resume_id
                .clone()
                .unwrap_or_else(|| session.id.clone());
            let config_dir = provider_config_dir(&account, provider);
            let seed = provider
                .transcript_path(&config_dir, &cwd, &convo_id)
                .filter(|path| path.exists())
                .map(|path| read_transcript_seed(&path, provider))
                .unwrap_or_default();
            let cwd = cwd.clone();
            let env = env.clone();
            let id = session.id.clone();
            let permission_mode = session.permission_mode;
            let spawned = self.manager.ensure_chat(&session.id, move || {
                Ok(ChatSession::StreamJson(StreamJsonSession::spawn(
                    provider,
                    &program,
                    &chat_args,
                    &cwd,
                    Some(&env),
                    seed,
                    permission_mode,
                )?))
            });
            if let Ok(sess) = spawned {
                self.watch_chat(workspace, &id, &sess);
            }
            return warning;
        }

        let options = SessionOptions {
            agent: command.to_string(),
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

    /// Like `watch_status`, but for a headless chat session: forwards its status to keep-awake and
    /// signals a change for that session so the sidebar updates. Its slash commands are not part of
    /// the summary; each attached viewport is sent them directly.
    ///
    /// Chat also has no agent hooks: its `can_use_tool` approval prompt is a stream-json control
    /// request, not a hook event, so `handle_agent_event` never runs for it. This watcher is
    /// therefore the notification source for chat — when the agent reaches an attention state
    /// (a permission prompt or a question) it plays the cue and fires the banner, gated on mute and
    /// focus exactly like the hook path.
    fn watch_chat(&self, workspace: &str, session_id: &str, session: &ChatSession) {
        let mut status_rx = session.subscribe_status();
        let mut subagents_rx = session.subscribe_subagents();
        let mut context_rx = session.subscribe_context();
        let keep_awake = self.keep_awake.clone();
        let change_tx = self.change_tx.clone();
        let notifications = self.notifications.clone();
        let sound = self.sound.clone();
        let focused = self.focused.clone();
        let workspace = workspace.to_string();
        let session_id = session_id.to_string();
        tokio::spawn(async move {
            // The backends re-send an unchanged status and context on almost every frame; only a
            // real change is worth telling viewports about.
            let mut last_status = *status_rx.borrow();
            let mut last_context = *context_rx.borrow();
            let changed = || {
                let _ = change_tx.send(Change::Session(session_id.clone()));
            };
            loop {
                tokio::select! {
                    result = status_rx.changed() => {
                        if result.is_err() { break }
                        let status = *status_rx.borrow_and_update();
                        keep_awake.handle(&session_id, awake_status(status, &subagents_rx.borrow()));
                        if status != last_status {
                            last_status = status;
                            changed();
                        }

                        // Notify on entering an attention state, unless muted. With the user
                        // here, only a paired device is told.
                        if let Some(cue) = cue_for(status)
                            && !notifications.is_muted(&workspace)
                        {
                            let audience = audience_for(focused.load(Ordering::Relaxed));
                            if audience == Audience::Everyone {
                                sound.play(cue);
                            }
                            notifications.fire(
                                &workspace,
                                Some(&session_id),
                                cue_text(cue),
                                audience,
                            );
                        }
                    }
                    // The running sub-agents changed (a Task spawned or finished), so the chat tab's
                    // "agents working" panel updates live.
                    result = subagents_rx.changed() => {
                        if result.is_err() { break }
                        let status = awake_status(last_status, &subagents_rx.borrow_and_update());
                        keep_awake.handle(&session_id, status);
                        changed();
                    }
                    // The context token count changed (a turn reported usage), so the composer's
                    // context meter updates.
                    result = context_rx.changed() => {
                        if result.is_err() { break }
                        let context = *context_rx.borrow_and_update();
                        if context != last_context {
                            last_context = context;
                            changed();
                        }
                    }
                }
            }
        });
    }

    /// Forwards a session's parsed status to keep-awake and the rail (change events). Sound and
    /// notifications come from the agent hooks (reliable), not this heuristic status parser.
    fn watch_status(&self, session_id: &str, session: &Session) {
        let mut status_rx = session.subscribe_status();
        let mut subagents_rx = session.subscribe_subagents();
        let mut activity_rx = session.subscribe_activity();
        let keep_awake = self.keep_awake.clone();
        let change_tx = self.change_tx.clone();
        let session_id = session_id.to_string();
        tokio::spawn(async move {
            // A hook re-sends `Thinking` on every tool start; only a real change is worth sending.
            let mut last_status = *status_rx.borrow();
            let changed = || {
                let _ = change_tx.send(Change::Session(session_id.clone()));
            };
            loop {
                tokio::select! {
                    result = status_rx.changed() => {
                        if result.is_err() { break }
                        let status = *status_rx.borrow_and_update();
                        keep_awake.handle(&session_id, awake_status(status, &subagents_rx.borrow()));
                        if status != last_status {
                            last_status = status;
                            changed();
                        }
                    }
                    // The running sub-agents changed (a Task spawned or finished), so the sidebar
                    // nests them under the tab live.
                    result = subagents_rx.changed() => {
                        if result.is_err() { break }
                        let status = awake_status(last_status, &subagents_rx.borrow_and_update());
                        keep_awake.handle(&session_id, status);
                        changed();
                    }
                    // The current activity changed (a tool started or finished), so the tab's live
                    // subtitle updates.
                    result = activity_rx.changed() => {
                        if result.is_err() { break }
                        activity_rx.borrow_and_update();
                        changed();
                    }
                }
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
        // While the user is looking at the app, a sound and banner here add nothing; only a paired
        // device is told then.
        let audience = audience_for(self.focused.load(Ordering::Relaxed));
        if audience == Audience::Everyone {
            self.sound.play(cue);
        }
        let text = match agent {
            Some(agent) => format!("({agent}) {}", cue_text(cue)),
            None => cue_text(cue).to_string(),
        };
        self.notifications
            .fire(&workspace, Some(session_id), &text, audience);
    }

    /// Records that a session has gone idle (Claude's idle notification). Status only: unlike
    /// `handle_agent_event` it plays no sound and fires no banner, because an agent going quiet is
    /// not an event worth interrupting the user for.
    pub fn handle_agent_idle(&self, session_id: &str) {
        if let Some(session) = self.manager.get(session_id) {
            session.set_hook_status(Status::Idle);
        }
    }

    /// Records that a session is working (Claude's UserPromptSubmit / PreToolUse hooks): marks the
    /// tab running and restarts the idle-decay clock. This is the reliable, per-agent "working"
    /// signal — far better than scraping the terminal spinner, whose wording keeps changing. Status
    /// only: an agent starting work fires no sound or banner.
    pub fn handle_agent_active(&self, session_id: &str) {
        if let Some(session) = self.manager.get(session_id) {
            session.mark_active();
        }
    }

    /// A tool is starting (Claude's PreToolUse hook): keep an in-progress turn marked running and
    /// refresh its idle-decay clock, but never resurrect a turn a hook already settled (a late,
    /// out-of-order PreToolUse delivered after Stop must not flip a finished tab back to "running").
    pub fn handle_agent_tool_active(&self, session_id: &str) {
        if let Some(session) = self.manager.get(session_id) {
            session.mark_tool_active();
        }
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
        let _ = self.change_tx.send(Change::Structure);
    }

    fn emit_global(&self) {
        let _ = self.change_tx.send(Change::Global);
    }
}

fn new_session_id() -> String {
    uuid::Uuid::new_v4().to_string()
}

fn basename(command: &str) -> &str {
    command.rsplit(['/', '\\']).next().unwrap_or(command)
}

/// Reads a conversation's on-disk transcript into chat events, so a resumed headless chat backend
/// starts with its history. Best-effort: an unreadable or malformed transcript yields no events
/// rather than failing the launch.
fn read_transcript_seed(
    path: &Path,
    provider: &dyn crate::providers::Provider,
) -> Vec<soromi_protocol::ChatEvent> {
    let Ok(contents) = fs::read_to_string(path) else {
        return Vec::new();
    };
    // Each entry once, where it first appears: the file can hold old messages a second time,
    // further down than newer ones.
    let mut reader = crate::transcript::Reader::new(Some(provider));
    contents
        .lines()
        .flat_map(|line| reader.read(line))
        .collect()
}

/// A short "last activity" for a restored session's subtitle, from the tail of its transcript: the
/// last thing the agent said (its first line, trimmed) or, failing that, the last tool it ran.
/// Parses from the end and stops at the first renderable event, so it reads only a few lines.
fn last_transcript_activity(
    path: &Path,
    provider: &dyn crate::providers::Provider,
) -> Option<String> {
    use soromi_protocol::ChatEvent;
    let contents = fs::read_to_string(path).ok()?;
    // The end of the conversation is its last new entry, which need not be the file's last line.
    for line in crate::transcript::entries(&contents, provider)
        .into_iter()
        .rev()
    {
        for event in provider.parse_transcript_line(line).into_iter().rev() {
            match event {
                ChatEvent::Assistant { text } => {
                    let summary =
                        truncate_chars(text.trim().lines().next().unwrap_or("").trim(), 60);
                    if !summary.is_empty() {
                        return Some(summary);
                    }
                }
                ChatEvent::Tool {
                    name,
                    path,
                    body,
                    tool_kind,
                    ..
                } => {
                    return Some(tool_activity(
                        tool_kind,
                        &name,
                        path.as_deref(),
                        body.as_deref(),
                    ));
                }
                _ => {}
            }
        }
    }
    None
}

/// A one-line label for a tool call (used as a restored session's last-activity subtitle). Keyed off
/// the provider-agnostic [`ToolKind`]; `name` is the fallback label for uncategorized tools.
fn tool_activity(kind: ToolKind, name: &str, path: Option<&str>, body: Option<&str>) -> String {
    let file = || path.and_then(|p| p.rsplit('/').next()).unwrap_or("a file");
    match kind {
        ToolKind::Run => format!(
            "Ran {}",
            truncate_chars(body.and_then(|b| b.lines().next()).unwrap_or("").trim(), 40)
        ),
        ToolKind::Edit => format!("Edited {}", file()),
        ToolKind::Write => format!("Wrote {}", file()),
        ToolKind::Read => format!("Read {}", file()),
        _ => name.to_string(),
    }
}

/// Truncates to `max` chars with a trailing ellipsis (char-safe, unlike byte slicing).
fn truncate_chars(text: &str, max: usize) -> String {
    if text.chars().count() <= max {
        return text.to_string();
    }
    let truncated: String = text.chars().take(max).collect();
    format!("{truncated}…")
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
/// What keep-awake is told a session is doing. A session is at work while its own turn runs, and
/// also while agents it started in the background still do: its turn is over and its status says
/// idle, but putting the machine to sleep then would stop them halfway.
fn awake_status(status: Status, subagents: &[SubAgent]) -> Status {
    if subagents
        .iter()
        .any(|agent| agent.status == Status::Thinking)
    {
        Status::Thinking
    } else {
        status
    }
}

/// Who a banner is for, given whether the app window on this computer is being looked at.
fn audience_for(focused: bool) -> Audience {
    if focused {
        Audience::Devices
    } else {
        Audience::Everyone
    }
}

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
/// The account a session runs under: the one it was pinned to, or else its workspace's first for
/// its agent.
fn session_account(accounts: &[AgentAccount], session: &SessionSpec) -> String {
    session
        .account
        .clone()
        .unwrap_or_else(|| account_for(accounts, &session.agent))
}

/// What a session is pinned to when it is asked to run under `account`: nothing when that is its
/// workspace's first account for the agent (it then follows that one), the account otherwise.
fn pin_for(accounts: &[AgentAccount], agent: &str, account: Option<String>) -> Option<String> {
    account.filter(|id| *id != account_for(accounts, agent))
}

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
            account: None,
            id: new_session_id(),
            agent,
            title: None,
            resume_id: None,
            mode: SessionMode::Terminal,
            permission_mode: PermissionMode::default(),
            model: None,
            effort: None,
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

    #[test]
    fn a_session_is_at_work_while_its_background_agents_are() {
        let agent = |status| SubAgent {
            name: "explore".into(),
            status,
            started_at: None,
        };

        // Its own turn is over, and an agent it started is still going.
        let running = [agent(Status::Done), agent(Status::Thinking)];
        assert_eq!(awake_status(Status::Idle, &running), Status::Thinking);
        assert_eq!(awake_status(Status::Done, &running), Status::Thinking);

        // Agents that have all stopped change nothing, and neither does having none.
        let stopped = [agent(Status::Done), agent(Status::Blocked)];
        assert_eq!(awake_status(Status::Done, &stopped), Status::Done);
        assert_eq!(awake_status(Status::Idle, &[]), Status::Idle);
        assert_eq!(
            awake_status(Status::WaitingInput, &[]),
            Status::WaitingInput
        );
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
        assert_eq!(service.read_file("kazomi", "readme.md", 1024).content, "hi");

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
        hub.open_session("kazomi", "/bin/cat".into(), None, SessionMode::Terminal)
            .unwrap();
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
    async fn restored_tabs_spawn_lazily_on_first_attach() {
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
        let session = hub.summaries()[0].sessions[0].id.clone();
        hub.dispose();

        // A fresh service restores the tab (it shows in the sidebar) but does NOT spawn its process.
        let restored = service();
        assert_eq!(restored.summaries()[0].sessions.len(), 1);
        assert!(restored.get(&session).is_none(), "restore must not spawn");

        // The first attach (via ensure_session) spawns the backend; a second call is a no-op.
        restored.ensure_session(&session);
        assert!(restored.get(&session).is_some(), "attach must spawn");
        restored.ensure_session(&session);
        assert!(restored.get(&session).is_some());

        restored.dispose();
        crate::home::set_soromi_home(None);
    }

    #[tokio::test]
    #[serial_test::serial]
    async fn set_session_agent_rebinds_the_tab_and_records_the_binding() {
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
        let session = hub.summaries()[0].sessions[0].id.clone();

        // Switch the tab to a different agent on a different account.
        hub.set_session_agent(&session, "/bin/echo".into(), Some("work".into()));

        let summary = &hub.summaries()[0];
        let spec = summary.sessions.iter().find(|s| s.id == session).unwrap();
        assert_eq!(spec.agent, "/bin/echo");
        // The account resolves via the new binding the switch recorded on the workspace.
        assert_eq!(spec.account, "work");
        assert!(
            summary
                .accounts
                .iter()
                .any(|a| a.agent == "/bin/echo" && a.id == "work")
        );

        hub.dispose();
        crate::home::set_soromi_home(None);
    }

    #[tokio::test]
    #[serial_test::serial]
    async fn a_tab_runs_under_whichever_of_its_agents_accounts_it_picks() {
        let home = tempfile::tempdir().unwrap();
        crate::home::set_soromi_home(Some(home.path().to_path_buf()));
        let root = tempfile::tempdir().unwrap();
        let account = |hub: &WorkspaceService, id: &str| {
            let summary = &hub.summaries()[0];
            summary
                .sessions
                .iter()
                .find(|s| s.id == id)
                .unwrap()
                .account
                .clone()
        };

        let hub = service();
        hub.create_space(CreateSpaceInput {
            name: "kazomi".into(),
            root: root.path().to_string_lossy().into_owned(),
            agent: "/bin/cat".into(),
            account: "personal".into(),
            folders: None,
        })
        .unwrap();
        // The workspace binds two accounts to the agent: the first is what tabs follow.
        let bindings = vec![
            AgentAccount {
                id: "personal".into(),
                agent: "/bin/cat".into(),
            },
            AgentAccount {
                id: "work".into(),
                agent: "/bin/cat".into(),
            },
        ];
        hub.update_space("kazomi", None, bindings.clone(), Vec::new(), None, None)
            .unwrap();
        let first = hub.summaries()[0].sessions[0].id.clone();
        assert_eq!(account(&hub, &first), "personal");

        // A new tab can start under the other one.
        let second = hub
            .open_session(
                "kazomi",
                "/bin/cat".into(),
                Some("work".into()),
                SessionMode::Terminal,
            )
            .unwrap();
        assert_eq!(second.account, "work");
        assert_eq!(account(&hub, &second.id), "work");

        // And a tab can move to it, and back.
        hub.set_session_agent(&first, "/bin/cat".into(), Some("work".into()));
        assert_eq!(account(&hub, &first), "work");
        hub.set_session_agent(&first, "/bin/cat".into(), Some("personal".into()));
        assert_eq!(account(&hub, &first), "personal");

        // Unbinding the account sends the tabs on it back to the workspace's first.
        hub.update_space(
            "kazomi",
            None,
            bindings[..1].to_vec(),
            Vec::new(),
            None,
            None,
        )
        .unwrap();
        assert_eq!(account(&hub, &second.id), "personal");

        hub.dispose();
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
