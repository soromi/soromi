use std::collections::HashMap;

use serde::{Deserialize, Serialize};

use crate::account::AccountProfile;
use crate::status::{KeepAwakeMode, Status};

/// A directory entry kind on the wire (`"file"` or `"dir"`).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[cfg_attr(feature = "ts", derive(ts_rs::TS))]
#[serde(rename_all = "lowercase")]
#[cfg_attr(
    feature = "ts",
    ts(export, export_to = "../../../packages/protocol/src/generated/")
)]
pub enum EntryKind {
    File,
    Dir,
}

/// One directory entry (its `type` field maps to `kind`).
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[cfg_attr(feature = "ts", derive(ts_rs::TS))]
#[cfg_attr(
    feature = "ts",
    ts(export, export_to = "../../../packages/protocol/src/generated/")
)]
pub struct DirEntry {
    pub name: String,
    #[serde(rename = "type")]
    #[cfg_attr(feature = "ts", ts(rename = "type"))]
    pub kind: EntryKind,
    /// True when the entry is git-ignored (shown dimmed in the tree).
    pub ignored: bool,
}

/// One changed file in a workspace's git working tree (read-only source-control view). A file can be
/// changed in both the index and the worktree at once, so `index` and `worktree` are independent.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[cfg_attr(feature = "ts", derive(ts_rs::TS))]
#[serde(rename_all = "camelCase")]
#[cfg_attr(feature = "ts", ts(rename_all = "camelCase"))]
#[cfg_attr(
    feature = "ts",
    ts(export, export_to = "../../../packages/protocol/src/generated/")
)]
pub struct GitChange {
    /// Path relative to the repo root, POSIX-separated (as git prints it).
    pub path: String,
    /// Staged (index) status letter — "M" "A" "D" "R" "C" "T" — or "" when not staged.
    pub index: String,
    /// Unstaged (worktree) status letter — "M" "D" "T" "?" (untracked) — or "" when clean there.
    pub worktree: String,
    /// The source path for a rename/copy, when applicable.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[cfg_attr(feature = "ts", ts(optional))]
    pub orig_path: Option<String>,
}

/// A workspace's git working-tree status (read-only). `is_repo` is false when the root isn't a git
/// repository, so the panel can show an empty state instead of an error.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[cfg_attr(feature = "ts", derive(ts_rs::TS))]
#[serde(rename_all = "camelCase")]
#[cfg_attr(feature = "ts", ts(rename_all = "camelCase"))]
#[cfg_attr(
    feature = "ts",
    ts(export, export_to = "../../../packages/protocol/src/generated/")
)]
pub struct GitStatusInfo {
    pub is_repo: bool,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[cfg_attr(feature = "ts", ts(optional))]
    pub branch: Option<String>,
    pub ahead: u32,
    pub behind: u32,
    pub changes: Vec<GitChange>,
}

/// A selectable model in the composer's picker. `value` is the launch id/alias the daemon passes for
/// this provider (`None` = the provider's own default); `effort` marks models that accept a
/// reasoning-effort level; `context_limit` sizes the "context filling up" meter. The provider owns
/// this list — the GUI holds no model names.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[cfg_attr(feature = "ts", derive(ts_rs::TS))]
#[serde(rename_all = "camelCase")]
#[cfg_attr(feature = "ts", ts(rename_all = "camelCase"))]
#[cfg_attr(
    feature = "ts",
    ts(export, export_to = "../../../packages/protocol/src/generated/")
)]
pub struct ModelOption {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[cfg_attr(feature = "ts", ts(optional))]
    pub value: Option<String>,
    pub label: String,
    pub description: String,
    pub effort: bool,
    pub context_limit: u32,
}

/// One provider's model-picker data: its models plus its reasoning-effort ladder. Returned per
/// provider in the `ModelCatalog` message so the composer renders whatever the provider exposes.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[cfg_attr(feature = "ts", derive(ts_rs::TS))]
#[serde(rename_all = "camelCase")]
#[cfg_attr(feature = "ts", ts(rename_all = "camelCase"))]
#[cfg_attr(
    feature = "ts",
    ts(export, export_to = "../../../packages/protocol/src/generated/")
)]
pub struct ProviderModels {
    pub models: Vec<ModelOption>,
    /// Effort levels low → highest; empty when the provider has no reasoning-effort control.
    pub effort_levels: Vec<String>,
    /// Display names for the effort tokens (the wire tokens don't always title-case cleanly).
    pub effort_labels: HashMap<String, String>,
    /// The effort the provider uses when none is set explicitly.
    pub default_effort: String,
}

/// Whether a skill is a slash command or an agent skill.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[cfg_attr(feature = "ts", derive(ts_rs::TS))]
#[serde(rename_all = "lowercase")]
#[cfg_attr(
    feature = "ts",
    ts(export, export_to = "../../../packages/protocol/src/generated/")
)]
pub enum SkillKind {
    Command,
    Skill,
}

/// Where a skill is defined: the user's config dir or the workspace's project dir.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[cfg_attr(feature = "ts", derive(ts_rs::TS))]
#[serde(rename_all = "lowercase")]
#[cfg_attr(
    feature = "ts",
    ts(export, export_to = "../../../packages/protocol/src/generated/")
)]
pub enum SkillScope {
    User,
    Project,
}

/// An agent skill or slash command available to a session, invoked as `/name`.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[cfg_attr(feature = "ts", derive(ts_rs::TS))]
#[cfg_attr(
    feature = "ts",
    ts(export, export_to = "../../../packages/protocol/src/generated/")
)]
pub struct Skill {
    pub name: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[cfg_attr(feature = "ts", ts(optional))]
    pub description: Option<String>,
    pub kind: SkillKind,
    pub scope: SkillScope,
}

/// A workspace's per-agent account binding: which account (by name) an `agent` runs under.
/// One entry per agent, so every session of that agent shares the same account.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[cfg_attr(feature = "ts", derive(ts_rs::TS))]
#[cfg_attr(
    feature = "ts",
    ts(export, export_to = "../../../packages/protocol/src/generated/")
)]
pub struct AgentAccount {
    /// The account profile name (e.g. `"work"`, `"personal"`).
    pub id: String,
    pub agent: String,
}

/// A sub-agent the agent spawned this turn (a Claude `Task` call). `name` is its task description;
/// `status` reuses the agent statuses (`thinking` = running, `done` = finished, `blocked` = errored).
/// `started_at` is the Unix-seconds timestamp it began, so viewers can show a live elapsed time.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[cfg_attr(feature = "ts", derive(ts_rs::TS))]
#[cfg_attr(
    feature = "ts",
    ts(export, export_to = "../../../packages/protocol/src/generated/")
)]
pub struct SubAgent {
    pub name: String,
    pub status: Status,
    pub started_at: Option<u32>,
}

/// A slash command ("action") the provider exposes for a session — Claude's `slash_commands` from
/// its `system/init` frame. `name` has no leading `/`; `description` is a one-line hint the daemon
/// resolves per provider (built-in map + custom `.claude/commands` frontmatter), absent when unknown.
/// Only providers that emit them populate this, so it doubles as the capability signal for the UI's
/// `/` menu.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[cfg_attr(feature = "ts", derive(ts_rs::TS))]
#[cfg_attr(
    feature = "ts",
    ts(export, export_to = "../../../packages/protocol/src/generated/")
)]
pub struct SlashCommand {
    pub name: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[cfg_attr(feature = "ts", ts(optional))]
    pub description: Option<String>,
}

/// One running terminal (tab) within a workspace. `account` is resolved from the workspace's
/// account bindings by matching `agent`.
/// How a session is presented: the real PTY terminal (default), or the headless chat driven over the
/// agent's stream-json interface. A session can switch between the two on desktop (same conversation).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default, Serialize, Deserialize)]
#[cfg_attr(feature = "ts", derive(ts_rs::TS))]
#[cfg_attr(
    feature = "ts",
    ts(export, export_to = "../../../packages/protocol/src/generated/")
)]
#[serde(rename_all = "lowercase")]
pub enum SessionMode {
    /// The real PTY / xterm terminal.
    #[default]
    Terminal,
    /// Headless chat: the agent runs over stream-json and renders as a conversation.
    Chat,
}

impl SessionMode {
    /// True for the default terminal mode, so it can be omitted from the wire (backward-compatible:
    /// an absent `mode` deserializes back to `Terminal`).
    pub fn is_terminal(&self) -> bool {
        matches!(self, SessionMode::Terminal)
    }
}

/// How the headless chat handles tool permissions. Serializes to Claude's `--permission-mode` values,
/// and is what the composer's permission dropdown chooses.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default, Serialize, Deserialize)]
#[cfg_attr(feature = "ts", derive(ts_rs::TS))]
#[cfg_attr(
    feature = "ts",
    ts(export, export_to = "../../../packages/protocol/src/generated/")
)]
#[serde(rename_all = "camelCase")]
pub enum PermissionMode {
    /// Ask before running tools that need approval (the control channel raises them).
    #[default]
    Default,
    /// Auto-accept file edits; still ask for the rest.
    AcceptEdits,
    /// Auto-approve everything (the old bypass behavior).
    BypassPermissions,
    /// Plan only — the agent proposes without executing.
    Plan,
}

impl PermissionMode {
    /// The `--permission-mode` value Claude expects.
    pub fn as_flag(&self) -> &'static str {
        match self {
            PermissionMode::Default => "default",
            PermissionMode::AcceptEdits => "acceptEdits",
            PermissionMode::BypassPermissions => "bypassPermissions",
            PermissionMode::Plan => "plan",
        }
    }

    /// True for the default (ask) mode, so it can be omitted from persisted specs / the wire.
    pub fn is_default(&self) -> bool {
        matches!(self, PermissionMode::Default)
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[cfg_attr(feature = "ts", derive(ts_rs::TS))]
#[cfg_attr(
    feature = "ts",
    ts(export, export_to = "../../../packages/protocol/src/generated/")
)]
pub struct SessionSummary {
    pub id: String,
    pub agent: String,
    pub account: String,
    pub status: Status,
    /// Terminal (default) or headless chat. Always serialized; `#[serde(default)]` lets older
    /// messages / persisted records without it deserialize back to `Terminal`.
    #[serde(default)]
    pub mode: SessionMode,
    /// The chat session's permission mode (drives the composer dropdown). Always serialized so the
    /// UI can show the current choice; defaults to ask.
    #[serde(default, rename = "permissionMode")]
    pub permission_mode: PermissionMode,
    /// The chat's model alias (`--model`) and reasoning effort (`--effort`), for the composer's model
    /// dropdown. Absent = the provider/model default.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[cfg_attr(feature = "ts", ts(optional))]
    pub model: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[cfg_attr(feature = "ts", ts(optional))]
    pub effort: Option<String>,
    /// A user-set tab name. Absent means the tab shows its account (auto-indexed on collision).
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[cfg_attr(feature = "ts", ts(optional))]
    pub title: Option<String>,
    /// Sub-agents the agent spawned this turn (Claude `Task` calls), each with its live status.
    /// Kept for the turn (finished ones stay, marked `done`), cleared on the next user prompt.
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    #[cfg_attr(feature = "ts", ts(as = "Option<Vec<SubAgent>>", optional))]
    pub subagents: Vec<SubAgent>,
    /// What the agent is currently working on — the latest in-progress tool call, e.g. "Editing
    /// config.ts". Absent when it isn't running a tool. Shown as the tab's live subtitle.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[cfg_attr(feature = "ts", ts(optional))]
    pub activity: Option<String>,
    /// Approximate tokens the current conversation occupies in the model's context window (from the
    /// last turn's `usage`: prompt + cached). The viewport compares it to the model's limit to warn
    /// when the context is filling up. Absent until a turn reports usage.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[cfg_attr(feature = "ts", ts(optional))]
    pub context_tokens: Option<u32>,
}

/// Rail-facing summary of a workspace. `status` is the aggregate of its sessions.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[cfg_attr(feature = "ts", derive(ts_rs::TS))]
#[cfg_attr(
    feature = "ts",
    ts(export, export_to = "../../../packages/protocol/src/generated/")
)]
pub struct WorkspaceSummary {
    pub name: String,
    pub status: Status,
    /// Absolute path the folders are relative to (for building absolute paths in the viewport).
    pub root: String,
    pub folders: Vec<String>,
    pub accounts: Vec<AgentAccount>,
    pub sessions: Vec<SessionSummary>,
    /// Extra instructions appended to the agent's system prompt for this workspace's sessions.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[cfg_attr(feature = "ts", ts(optional))]
    pub instructions: Option<String>,
}

/// A paired remote device (a phone). `pairingCode` holds this device's relay, room, and end-to-end
/// key; the desktop renders it as a QR for the mobile app to scan. Only ever sent to the trusted
/// local viewport, never over the relay.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[cfg_attr(feature = "ts", derive(ts_rs::TS))]
#[cfg_attr(
    feature = "ts",
    ts(export, export_to = "../../../packages/protocol/src/generated/")
)]
pub struct DeviceSummary {
    pub id: String,
    pub name: String,
    #[cfg_attr(feature = "ts", ts(rename = "pairingCode"))]
    #[serde(rename = "pairingCode")]
    pub pairing_code: String,
    /// Whether this device's phone is currently connected (live), by either route. A paired device
    /// with no phone attached is `false`.
    pub connected: bool,
    /// How the phone is connected, while it is: straight over the local network, or through the
    /// relay. Absent while it is not connected.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[cfg_attr(feature = "ts", ts(optional))]
    pub route: Option<DeviceRoute>,
}

/// The way a paired device reaches the daemon.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[cfg_attr(feature = "ts", derive(ts_rs::TS))]
#[serde(rename_all = "kebab-case")]
#[cfg_attr(
    feature = "ts",
    ts(export, export_to = "../../../packages/protocol/src/generated/")
)]
pub enum DeviceRoute {
    /// A socket straight to the daemon, on a network the two share (the same Wi-Fi, a VPN).
    Direct,
    /// Through the relay, from anywhere.
    Relay,
}

/// One usage window for an agent (e.g. the 5-hour session or the weekly cap). `percent` is 0-100;
/// `resetsAt` is a unix timestamp in seconds, when the window rolls over.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[cfg_attr(feature = "ts", derive(ts_rs::TS))]
#[cfg_attr(
    feature = "ts",
    ts(export, export_to = "../../../packages/protocol/src/generated/")
)]
pub struct UsageWindow {
    pub label: String,
    pub percent: f64,
    #[serde(rename = "resetsAt", default, skip_serializing_if = "Option::is_none")]
    #[cfg_attr(feature = "ts", ts(rename = "resetsAt", optional))]
    pub resets_at: Option<f64>,
}

/// An agent's plan usage, as read from that provider's usage API.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[cfg_attr(feature = "ts", derive(ts_rs::TS))]
#[cfg_attr(
    feature = "ts",
    ts(export, export_to = "../../../packages/protocol/src/generated/")
)]
pub struct AgentUsage {
    pub agent: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[cfg_attr(feature = "ts", ts(optional))]
    pub plan: Option<String>,
    pub windows: Vec<UsageWindow>,
    /// Set instead of windows when usage could not be read but the account is signed in (e.g. the
    /// login lacks the scope the usage endpoint needs). A short, actionable line for the viewport.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[cfg_attr(feature = "ts", ts(optional))]
    pub note: Option<String>,
}

/// The relay used when pairing devices. Runtime-configurable (self-host) so the bundled app never
/// needs a rebuild to point at a different relay. Empty values fall back to the daemon's env vars,
/// then its compiled defaults.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
#[cfg_attr(feature = "ts", derive(ts_rs::TS))]
#[cfg_attr(
    feature = "ts",
    ts(export, export_to = "../../../packages/protocol/src/generated/")
)]
pub struct RemoteConfig {
    /// The relay WebSocket URL the daemon and paired phones dial (e.g. `wss://relay.example.com`).
    pub relay_url: String,
    /// Shared secret the daemon presents to the relay to create a room (self-host gate). Held only
    /// on the daemon (never in a pairing code); paired phones join by room id without it.
    pub access_key: String,
    /// Whether paired devices may connect straight to this computer when they share a network with
    /// it, instead of through the relay. On unless turned off. The link is end-to-end encrypted
    /// with the device's key either way, and nothing is served to a socket that does not hold one.
    #[serde(default = "enabled")]
    pub direct: bool,
}

fn enabled() -> bool {
    true
}

/// What the relay settings fall back to when left empty: this daemon's environment, or else what
/// it was built with. Shown in the settings screen in place of an empty field, so a setting the
/// user never touched reads as "the default" and not as a value they chose.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
#[cfg_attr(feature = "ts", derive(ts_rs::TS))]
#[cfg_attr(
    feature = "ts",
    ts(export, export_to = "../../../packages/protocol/src/generated/")
)]
pub struct RemoteDefaults {
    pub relay_url: String,
    pub access_key: String,
}

/// Which side has to update when a client and the daemon speak incompatible protocol versions.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[cfg_attr(feature = "ts", derive(ts_rs::TS))]
#[serde(rename_all = "kebab-case")]
#[cfg_attr(
    feature = "ts",
    ts(export, export_to = "../../../packages/protocol/src/generated/")
)]
pub enum IncompatibleAction {
    /// The client is older than the daemon supports.
    UpdateClient,
    /// The client is newer than the daemon.
    UpdateDaemon,
}

/// Viewport -> daemon. A discriminated union on `type`.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[cfg_attr(feature = "ts", derive(ts_rs::TS))]
#[serde(
    tag = "type",
    rename_all = "kebab-case",
    rename_all_fields = "camelCase"
)]
#[cfg_attr(
    feature = "ts",
    ts(export, export_to = "../../../packages/protocol/src/generated/")
)]
pub enum ClientMessage {
    /// The first message a client sends: its protocol version and a stable id for this install.
    /// Replied with `Welcome`, or `Incompatible` if the versions cannot talk; nothing else is
    /// answered until then. On a relay link a new `Hello` also marks a fresh client on the same
    /// daemon socket, resetting what was attached.
    Hello {
        protocol: u32,
        client_id: String,
    },
    /// Round-trip probe: echoed back as `Pong` with the same nonce. Used to measure latency and to
    /// check that a connection is still alive.
    Ping {
        nonce: u32,
    },
    /// Start streaming a session to this viewport: its terminal or chat as it stands, then every
    /// change. `chat` is how much of the session's chat the viewport still holds from an earlier
    /// attach (the `log` and `seq` it was last given); the daemon answers `ChatResumed` and sends
    /// only what came after when that still lines up, and `ChatReset` with a fresh page otherwise.
    Attach {
        session: String,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        #[cfg_attr(feature = "ts", ts(optional))]
        chat: Option<ChatCursor>,
    },
    /// Stop streaming a session to this viewport (it is no longer on screen). The session keeps
    /// running; attaching again replays its current state.
    Detach {
        session: String,
    },
    Input {
        session: String,
        data: String,
    },
    Resize {
        session: String,
        cols: u16,
        rows: u16,
    },
    OpenSession {
        workspace: String,
        agent: String,
        /// The account to bind this agent to. Optional when the workspace already binds the
        /// agent; required (and recorded) the first time an agent is used.
        #[serde(default, skip_serializing_if = "Option::is_none")]
        #[cfg_attr(feature = "ts", ts(optional))]
        account: Option<String>,
        /// How to open the tab: the real terminal (default) or the headless chat. Absent = terminal.
        #[serde(default, skip_serializing_if = "Option::is_none")]
        #[cfg_attr(feature = "ts", ts(optional))]
        mode: Option<SessionMode>,
    },
    CloseSession {
        session: String,
    },
    /// A chat-mode turn: send this text to the headless agent as a new user message. Gated by the
    /// same control model as terminal `Input`. `files` are pasted / attached images and documents.
    ChatTurn {
        session: String,
        text: String,
        #[serde(default)]
        files: Vec<ChatFile>,
    },
    /// Interrupt the headless agent's current turn (the composer's stop button). Gated by control.
    ChatInterrupt {
        session: String,
    },
    /// Answer a pending tool approval (headless chat): `allow=false` denies it. Gated by control.
    ChatApprovalResponse {
        session: String,
        id: String,
        allow: bool,
    },
    /// Change a chat session's permission mode (the composer dropdown). Applied live and persisted.
    ChatPermissionMode {
        session: String,
        mode: PermissionMode,
    },
    /// Change a chat session's model + reasoning effort (the composer's model dropdown). Both `None`
    /// resets to the provider default. Applied live (`/model` / `/effort`) and persisted.
    ChatSetModel {
        session: String,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        model: Option<String>,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        effort: Option<String>,
    },
    /// Run a bare slash command in a chat session (e.g. `/compact`, `/clear`) — sent to the agent as a
    /// command, not recorded as a user message. The composer's context controls use this.
    ChatCommand {
        session: String,
        command: String,
    },
    /// Request the page of messages just before the `loaded` most recent the viewport already holds
    /// (the "Load earlier" button). The daemon replies with a `ChatHistory` to prepend.
    ChatLoadEarlier {
        session: String,
        loaded: u32,
    },
    /// Ask for the bytes of a file attached to a chat message, which chat events leave out
    /// (`ChatFile::deferred`). `log` and `seq` say which message, `index` which of its files. The
    /// daemon replies with `ChatFileData`, or not at all if there is no such file.
    ChatFetchFile {
        session: String,
        log: String,
        seq: u32,
        index: u32,
    },
    /// Switch a tab between the terminal and headless chat. The daemon tears down the current backend
    /// and resumes the same conversation in the other. Gated by control.
    SwitchMode {
        session: String,
        mode: SessionMode,
    },
    /// Changes a tab's agent (e.g. Claude -> Codex). The daemon rebinds the tab to the new agent's
    /// account and restarts its backend. Providers don't share a transcript, so the conversation
    /// starts fresh under the new agent. `account` binds the agent the first time it's used in the
    /// workspace (like `OpenSession`); optional when already bound.
    SetSessionAgent {
        session: String,
        agent: String,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        #[cfg_attr(feature = "ts", ts(optional))]
        account: Option<String>,
    },
    /// Renames a tab. An empty `title` clears the custom name (back to the account label).
    RenameSession {
        session: String,
        title: String,
    },
    ListWorkspaces,
    OpenWorkspace {
        dir: String,
    },
    CreateSpace {
        name: String,
        root: String,
        agent: String,
        account: String,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        #[cfg_attr(feature = "ts", ts(optional))]
        folders: Option<Vec<String>>,
    },
    RemoveSpace {
        workspace: String,
    },
    /// Reorders the workspaces to match `order` (the full list of workspace names, top to bottom).
    /// Persisted and broadcast, so the new order shows on every viewport.
    ReorderSpaces {
        order: Vec<String>,
    },
    MuteWorkspace {
        workspace: String,
        muted: bool,
    },
    ListDir {
        workspace: String,
        path: String,
    },
    ReadFile {
        workspace: String,
        path: String,
    },
    /// Save an edited file back to disk (the file editor). Path is workspace-relative and validated
    /// against the workspace root, like `ReadFile`. The daemon replies with `FileSaved` or `Error`.
    WriteFile {
        workspace: String,
        path: String,
        content: String,
    },
    /// Open an ad-hoc shell PTY for a workspace, rooted at `folder` (workspace-relative; "" = root).
    /// The client mints `shell` as `shell:<uuid>`, then `Attach`es to it like any session. These
    /// shells are not persisted and are not workspace tabs.
    OpenShell {
        workspace: String,
        shell: String,
        folder: String,
    },
    /// The git working-tree status of one of a workspace's folders (read-only source-control
    /// view). `folder` is workspace-relative ("" = the root): a workspace made of several
    /// repositories has one status per folder. Replied with `GitStatus`.
    GitStatus {
        workspace: String,
        #[serde(default)]
        folder: String,
    },
    /// The unified diff for one changed file of the repository at `folder`. `staged` selects the
    /// index diff (`--cached`) vs the worktree diff. Replied with `GitDiff`.
    GitDiff {
        workspace: String,
        #[serde(default)]
        folder: String,
        path: String,
        staged: bool,
    },
    ListSkills {
        session: String,
    },
    /// Request the per-provider model catalogs (the composer's model picker). Replied with
    /// `ModelCatalog`. The GUI sends this once on connect.
    ListModels,
    ListAccounts,
    SaveAccount {
        profile: AccountProfile,
    },
    DeleteAccount {
        name: String,
    },
    SetKeepAwakeMode {
        mode: KeepAwakeMode,
    },
    ExportSpace {
        workspace: String,
    },
    CheckProvider {
        provider: String,
        config_dir: String,
    },
    UpdateSpace {
        workspace: String,
        /// A new name for the workspace. Absent/empty keeps the current one; renaming fails if
        /// another workspace already has that name.
        #[serde(default, skip_serializing_if = "Option::is_none")]
        #[cfg_attr(feature = "ts", ts(optional))]
        name: Option<String>,
        accounts: Vec<AgentAccount>,
        /// The workspace's work folders (relative to its root). Changing them relaunches every tab
        /// so agents pick up the new `--add-dir` paths.
        folders: Vec<String>,
        /// A new root for the folders (their common parent), when adding a folder outside the
        /// current root shifts it. Absent keeps the existing root.
        #[serde(default, skip_serializing_if = "Option::is_none")]
        #[cfg_attr(feature = "ts", ts(optional))]
        root: Option<String>,
        /// Instructions appended to the agent's system prompt. Applies to sessions opened after
        /// the change. `None`/empty clears them.
        #[serde(default, skip_serializing_if = "Option::is_none")]
        #[cfg_attr(feature = "ts", ts(optional))]
        instructions: Option<String>,
    },
    /// Re-run the update check now (the "Check for updates" menu item).
    CheckUpdate,
    /// Pair a new remote device: mint a room + key, persist it, start dialing the relay for it,
    /// and reply with `DevicePaired` (whose `pairingCode` the desktop shows as a QR).
    CreateDevice {
        name: String,
    },
    /// Fetch plan usage for the workspace's agents (from each provider's usage API). Replies with
    /// `Usage`. Results are cached briefly on the daemon; `force` skips the cache (a manual refresh).
    RequestUsage {
        workspace: String,
        /// Skip the daemon's usage cache and re-fetch (a manual refresh). Defaults to false.
        #[serde(default)]
        force: bool,
    },
    /// List paired devices (for the settings screen). Replies with `DeviceList`.
    ListDevices,
    /// Revoke a paired device: forget it and stop dialing its relay room. Replies with `DeviceList`.
    RevokeDevice {
        id: String,
    },
    /// Ask for the remote settings (for the settings screen). Replies with `RemoteConfig`.
    GetRemoteConfig,
    /// Set the remote settings (self-host). Persisted and applied to pairing live. Replies with
    /// `RemoteConfig`. Empty fields clear the override (fall back to env / default).
    SetRemoteConfig {
        config: RemoteConfig,
    },
    /// This viewport claims sole control of the terminals: it drives input and owns the size, and
    /// every other viewport goes on watching, read-only. Triggers a `Control` broadcast.
    TakeControl,
    /// Whether the app is on screen. From the desktop: while its window is focused, the daemon
    /// suppresses agent-event sounds and banners on this computer (the user is already looking at
    /// the app). From a paired device: while its app is on screen it is sent banners over its
    /// link; once it is not, they are pushed to it instead, if it registered for that
    /// (`RegisterPush`). A client that never says is taken to be on screen.
    SetFocused {
        focused: bool,
    },
    /// This viewport shows notifications itself, so the daemon sends them here as `Notify`
    /// messages. From the Electron shell (native banners with the app identity) that is instead of
    /// the daemon firing its own. From a paired device it is beside whatever the computer does:
    /// the device is told of every banner, and decides by its own screen whether to show it.
    NotificationsNative {
        enabled: bool,
    },
    /// From a paired device: the token banners can be pushed to it with while its app is closed or
    /// behind another one, or `None` to stop. The daemon keeps it with the device and hands banners
    /// to the push service, which passes them on to Apple or Google. Sent again on every
    /// connection; ignored from anything that is not a paired device.
    RegisterPush {
        #[serde(default)]
        token: Option<String>,
    },
}

/// Daemon -> viewport. A discriminated union on `type`.
// No `Eq`: `Usage` carries `f64` utilization, which is `PartialEq` only.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[cfg_attr(feature = "ts", derive(ts_rs::TS))]
#[serde(
    tag = "type",
    rename_all = "kebab-case",
    rename_all_fields = "camelCase"
)]
#[cfg_attr(
    feature = "ts",
    ts(export, export_to = "../../../packages/protocol/src/generated/")
)]
pub enum ServerMessage {
    /// Reply to `Hello`: the daemon's protocol version and its release version.
    Welcome {
        protocol: u32,
        version: String,
    },
    /// Reply to a `Hello` the daemon cannot serve, or to a client that skipped it. `action` says
    /// which side must update.
    Incompatible {
        protocol: u32,
        action: IncompatibleAction,
    },
    /// Echo of a `Ping`.
    Pong {
        nonce: u32,
    },
    /// Reply to `Attach` for a terminal session: its output arrives as binary frames tagged with
    /// `slot` (`[0x01][slot, big-endian u16][utf-8 bytes]`), not as a message.
    Attached {
        session: String,
        slot: u16,
    },
    /// The size of a session's terminal: sent after `Attached`, ahead of the first output, and again
    /// whenever the viewport in control resizes it. Output is drawn for this size, so a viewport
    /// that is only watching shows its terminal at it instead of at the size of its own pane.
    TerminalSize {
        session: String,
        cols: u16,
        rows: u16,
    },
    Status {
        session: String,
        status: Status,
    },
    /// A banner to show natively. Sent to a viewer that opted in via `NotificationsNative`: the
    /// Electron shell (and only while it is connected; otherwise the daemon fires the notification
    /// itself), and a paired device. `title` is the app name, `body` the text.
    /// `workspace`/`session` identify what the banner is about, so clicking it opens that tab.
    Notify {
        title: String,
        body: String,
        #[serde(skip_serializing_if = "Option::is_none")]
        workspace: Option<String>,
        #[serde(skip_serializing_if = "Option::is_none")]
        session: Option<String>,
    },
    SessionOpened {
        workspace: String,
        session: SessionSummary,
    },
    /// A session's agent was relaunched (its workspace folders or account changed). The viewport
    /// re-attaches so the terminal reflects the fresh process.
    SessionReset {
        session: String,
    },
    WorkspaceList {
        workspaces: Vec<WorkspaceSummary>,
    },
    /// One session's summary changed (status, activity, sub-agents, context). `status` is the
    /// workspace's new aggregate status. Current clients get this instead of a full `WorkspaceList`.
    SessionUpdated {
        workspace: String,
        status: Status,
        session: SessionSummary,
    },
    /// The slash commands a chat session's provider exposes, for the composer's `/` menu. Sent on
    /// attach and when the list changes.
    SessionCommands {
        session: String,
        commands: Vec<SlashCommand>,
    },
    WorkspaceOpened {
        workspace: String,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        #[cfg_attr(feature = "ts", ts(optional))]
        warning: Option<String>,
    },
    Error {
        message: String,
    },
    DirListing {
        workspace: String,
        path: String,
        entries: Vec<DirEntry>,
    },
    FileContent {
        workspace: String,
        path: String,
        content: String,
        truncated: bool,
        binary: bool,
    },
    /// A `WriteFile` succeeded — the editor clears its unsaved state for this file.
    FileSaved {
        workspace: String,
        path: String,
    },
    /// The git working-tree status of a workspace's `folder` (reply to `GitStatus`). `repos` are
    /// the workspace's folders that are repositories ("" = the root), for a viewport to offer:
    /// the root, the folders the workspace is made of, and the directories right under the root.
    GitStatus {
        workspace: String,
        #[serde(default)]
        folder: String,
        status: GitStatusInfo,
        #[serde(default)]
        repos: Vec<String>,
    },
    /// The unified diff for one changed file (reply to `GitDiff`). `patch` is the raw `git diff`
    /// output; `truncated` marks that a very large diff was clipped.
    GitDiff {
        workspace: String,
        #[serde(default)]
        folder: String,
        path: String,
        staged: bool,
        patch: String,
        truncated: bool,
    },
    SkillList {
        session: String,
        skills: Vec<Skill>,
    },
    /// The model-picker catalogs, keyed by provider (reply to `ListModels`).
    ModelCatalog {
        catalog: HashMap<String, ProviderModels>,
    },
    KeepAwake {
        active: bool,
        mode: KeepAwakeMode,
    },
    AccountList {
        accounts: Vec<AccountProfile>,
    },
    SpaceExported {
        workspace: String,
        path: String,
    },
    ProviderStatus {
        provider: String,
        config_dir: String,
        logged_in: bool,
    },
    /// A newer release exists. `url` opens the release page; `notes` is the changelog body.
    UpdateAvailable {
        version: String,
        url: String,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        #[cfg_attr(feature = "ts", ts(optional))]
        notes: Option<String>,
    },
    /// The manual update check found nothing newer (only sent in reply to `CheckUpdate`).
    UpToDate,
    /// A device was just paired; `device.pairingCode` is shown as a QR to scan.
    DevicePaired {
        device: DeviceSummary,
    },
    /// The current set of paired devices (reply to `ListDevices` / `RevokeDevice`).
    DeviceList {
        devices: Vec<DeviceSummary>,
    },
    /// Plan usage for a workspace's agents (reply to `RequestUsage`). Agents whose usage could not
    /// be fetched are omitted.
    Usage {
        workspace: String,
        agents: Vec<AgentUsage>,
    },
    /// The remote settings as they are set (reply to `GetRemoteConfig` / `SetRemoteConfig`):
    /// `config` holds only what the user overrode, with an empty field for anything left alone, and
    /// `defaults` what an empty field falls back to.
    RemoteConfig {
        config: RemoteConfig,
        defaults: RemoteDefaults,
    },
    /// Where a paired device can reach this computer without the relay: one WebSocket address per
    /// network the computer is on (`ws://192.168.1.20:8318`), empty when direct access is off. Sent
    /// to a device after its `Hello` and again whenever the addresses change; the device keeps them
    /// and tries them next to the relay, preferring one that answers.
    Routes {
        routes: Vec<String>,
    },
    /// Who controls the terminals right now, from this viewport's perspective. `holder` is `None`
    /// when this viewport is the controller; otherwise it names the device in control, and this
    /// viewport watches read-only (its input and resizes are ignored) until it sends
    /// `TakeControl`. Pushed whenever control changes.
    Control {
        #[serde(default, skip_serializing_if = "Option::is_none")]
        #[cfg_attr(feature = "ts", ts(optional))]
        holder: Option<String>,
    },
    /// Chat events to add to the end of what the viewport holds: one as it happens, or the run a
    /// returning viewport missed. Every event has a place in its session's log, counting from 1, and
    /// `seq` is the place of the last one here — so the viewport knows what it holds up to, and can
    /// drop an event it was already sent.
    Chat {
        session: String,
        events: Vec<ChatEvent>,
        seq: u32,
    },
    /// The viewport's copy of a session's chat is void (first attach, a new or resumed conversation,
    /// or it fell too far behind): it clears the chat, approvals and streaming text it held. `log`
    /// names this run of the log and `seq` is the place of its last event; the events themselves
    /// follow as a `ChatHistory` page ending there. Both go back to the daemon in the next `Attach`.
    ChatReset {
        session: String,
        log: String,
        seq: u32,
    },
    /// Reply to an `Attach` whose `chat` cursor still lined up: the viewport keeps the events it
    /// holds (a `Chat` with what it missed follows if there is any) and drops the approvals and
    /// streaming text it held, which are sent again as they stand now.
    ChatResumed {
        session: String,
    },
    /// Reply to `ChatFetchFile`: the file, with its bytes.
    ChatFileData {
        session: String,
        log: String,
        seq: u32,
        index: u32,
        file: ChatFile,
    },
    /// Text for the assistant message currently streaming in. By default `text` is appended to what
    /// the viewport already holds; with `replace` it replaces it (sent on attach, on a resync, and
    /// with empty text when the live message has committed as a `Chat` event or the turn ended).
    /// Only headless "chat" sessions emit these.
    ChatDelta {
        session: String,
        text: String,
        #[serde(default, skip_serializing_if = "std::ops::Not::not")]
        #[cfg_attr(feature = "ts", ts(as = "Option<bool>", optional))]
        replace: bool,
    },
    /// A tool call is waiting for the user to allow or deny it (headless chat, permission prompts).
    /// Sent on the `can_use_tool` control request; the turn is paused until answered.
    ChatApproval {
        session: String,
        approval: ToolApproval,
    },
    /// A pending approval was answered (here or by another viewer); viewports clear its panel.
    ChatApprovalResolved {
        session: String,
        id: String,
    },
    /// A page of earlier messages to prepend: the initial tail snapshot on attach, or a "load
    /// earlier" page. `has_more` is whether even-older messages remain on the daemon.
    ChatHistory {
        session: String,
        events: Vec<ChatEvent>,
        has_more: bool,
    },
}

/// A tool call awaiting approval in the headless chat (`--permission-prompt-tool stdio`). `id` is the
/// CLI's control-request id we answer with; `name` / `path` / `body` render it like a tool card so
/// the user sees what they're approving. `kind` is the provider-agnostic category (a plan approval
/// renders its own review UI; edits are auto-approved under "accept edits") so the UI never matches a
/// provider's tool name.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[cfg_attr(feature = "ts", derive(ts_rs::TS))]
#[serde(rename_all = "camelCase")]
#[cfg_attr(
    feature = "ts",
    ts(export, export_to = "../../../packages/protocol/src/generated/")
)]
pub struct ToolApproval {
    pub id: String,
    pub name: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[cfg_attr(feature = "ts", ts(optional))]
    pub path: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[cfg_attr(feature = "ts", ts(optional))]
    pub body: Option<String>,
    #[serde(default)]
    pub kind: ToolKind,
}

/// A file pasted or attached to a chat turn: base64 `data` plus its MIME type. Images and PDFs go to
/// the agent as image / document content blocks; text files are inlined as text.
///
/// In chat events sent to a viewport the bytes are left out: `data` is empty and `deferred` is set.
/// The viewport asks for them with `ChatFetchFile` when it shows the file.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[cfg_attr(feature = "ts", derive(ts_rs::TS))]
#[serde(rename_all = "camelCase")]
#[cfg_attr(
    feature = "ts",
    ts(export, export_to = "../../../packages/protocol/src/generated/")
)]
pub struct ChatFile {
    pub media_type: String,
    pub data: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[cfg_attr(feature = "ts", ts(optional))]
    pub filename: Option<String>,
    /// The bytes were left out of this copy and are fetched on demand.
    #[serde(default, skip_serializing_if = "std::ops::Not::not")]
    #[cfg_attr(feature = "ts", ts(as = "Option<bool>", optional))]
    pub deferred: bool,
}

/// How much of a session's chat a viewport holds: everything up to event `seq` of the run of the
/// log named `log`. Both come from the daemon (`ChatReset`, then each `Chat`), and go back to it in
/// `Attach` so a returning viewport is sent only what it missed.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[cfg_attr(feature = "ts", derive(ts_rs::TS))]
#[serde(rename_all = "camelCase")]
#[cfg_attr(
    feature = "ts",
    ts(export, export_to = "../../../packages/protocol/src/generated/")
)]
pub struct ChatCursor {
    pub log: String,
    pub seq: u32,
}

/// The provider-agnostic category of a tool call, assigned by each provider from its own raw tool
/// names (Claude's `Edit`/`Bash`/`Task`, Codex's `apply_patch`/`shell`, …). Everything downstream —
/// the tool card's icon, the activity line's verb, "is this an edit / a sub-agent / a plan" — keys
/// off this instead of matching one provider's tool names, so a new provider only maps its names to
/// these kinds (see `Provider::tool_kind`) and inherits the same output.
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Serialize, Deserialize)]
#[cfg_attr(feature = "ts", derive(ts_rs::TS))]
#[serde(rename_all = "lowercase")]
#[cfg_attr(
    feature = "ts",
    ts(export, export_to = "../../../packages/protocol/src/generated/")
)]
pub enum ToolKind {
    /// Edits an existing file (Claude `Edit`/`MultiEdit`/`NotebookEdit`/`Update`).
    Edit,
    /// Writes/creates a whole file (Claude `Write`).
    Write,
    /// Runs a shell command (Claude `Bash`).
    Run,
    /// Reads a file (Claude `Read`).
    Read,
    /// Searches the codebase (Claude `Grep`/`Glob`).
    Search,
    /// Spawns a sub-agent (Claude `Task`/`Agent`).
    Agent,
    /// Loads a skill (Claude `Skill`).
    Skill,
    /// Proposes a plan / exits plan mode (Claude `ExitPlanMode`).
    Plan,
    /// Anything else.
    #[default]
    Other,
}

/// One structured entry from an agent's on-disk transcript, rendered by the mobile "chat" viewport
/// in place of the raw terminal. The daemon tails the agent's JSONL transcript (Claude first) and
/// parses each line into these; `id` ties a tool result back to its call.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[cfg_attr(feature = "ts", derive(ts_rs::TS))]
#[serde(
    tag = "kind",
    rename_all = "kebab-case",
    rename_all_fields = "camelCase"
)]
#[cfg_attr(
    feature = "ts",
    ts(export, export_to = "../../../packages/protocol/src/generated/")
)]
pub enum ChatEvent {
    /// A prompt the user sent, with any attached files (images/documents) for inline thumbnails.
    User {
        text: String,
        // Left off the wire when empty, so the generated type has to say it may be missing.
        #[serde(default, skip_serializing_if = "Vec::is_empty")]
        #[cfg_attr(feature = "ts", ts(as = "Option<Vec<ChatFile>>", optional))]
        files: Vec<ChatFile>,
    },
    /// Assistant prose (markdown).
    Assistant { text: String },
    /// Assistant reasoning, shown collapsed.
    Thinking { text: String },
    /// A tool the assistant invoked. `path` is the file it touched (if any); `body` is a renderable
    /// summary (a shell command, a diff, or short JSON). `kind` is the provider-agnostic category the
    /// provider assigned to the raw tool name, so the UI and activity labels never match tool names.
    Tool {
        id: String,
        name: String,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        #[cfg_attr(feature = "ts", ts(optional))]
        path: Option<String>,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        #[cfg_attr(feature = "ts", ts(optional))]
        body: Option<String>,
        // Not named `kind`: the enum is internally tagged `kind`, so the tool's category is `toolKind`.
        #[serde(default)]
        tool_kind: ToolKind,
    },
    /// The result of a tool call, tied to it by `id`.
    ToolResult { id: String, ok: bool, text: String },
    /// A system notice, not conversation (e.g. the turn was interrupted). Rendered as a centered
    /// marker, not a user/assistant message.
    Notice { text: String },
}
