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
    /// Slash commands ("actions") the provider exposes for this session (Claude only, for now), for
    /// the chat composer's `/` menu. Empty for providers that don't expose them.
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub commands: Vec<SlashCommand>,
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

/// A paired remote device (a phone). `pairingUrl` opens the web viewport already configured with
/// this device's relay, room, and end-to-end key; the desktop renders it as a QR to scan. Only
/// ever sent to the trusted local viewport, never over the relay.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[cfg_attr(feature = "ts", derive(ts_rs::TS))]
#[cfg_attr(
    feature = "ts",
    ts(export, export_to = "../../../packages/protocol/src/generated/")
)]
pub struct DeviceSummary {
    pub id: String,
    pub name: String,
    #[cfg_attr(feature = "ts", ts(rename = "pairingUrl"))]
    #[serde(rename = "pairingUrl")]
    pub pairing_url: String,
    /// Whether this device's phone is currently connected through the relay (live). A paired device
    /// with no phone attached, or an unreachable relay, is `false`.
    pub connected: bool,
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

/// The relay + web-viewport URLs used when pairing devices. Runtime-configurable (self-host) so the
/// bundled app never needs a rebuild to point at a different relay or hosted web app. Empty values
/// fall back to the daemon's env vars, then its compiled defaults.
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
    /// The base URL the pairing QR points at, where the web viewport is hosted.
    pub web_url: String,
    /// Shared secret the daemon presents to the relay to create a room (self-host gate). Held only
    /// on the daemon (never in a pairing link); paired phones join by room id without it.
    pub access_key: String,
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
    Attach {
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
    /// Switch a tab between the terminal and headless chat. The daemon tears down the current backend
    /// and resumes the same conversation in the other. Gated by control.
    SwitchMode {
        session: String,
        mode: SessionMode,
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
    ListSkills {
        session: String,
    },
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
    /// and reply with `DevicePaired` (whose `pairingUrl` the desktop shows as a QR).
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
    /// Ask for the current relay + web URLs (for the settings screen). Replies with `RemoteConfig`.
    GetRemoteConfig,
    /// Set the relay + web URLs (self-host). Persisted and applied to pairing live. Replies with the
    /// resolved `RemoteConfig`. Empty fields clear the override (fall back to env / default).
    SetRemoteConfig {
        config: RemoteConfig,
    },
    /// This viewport claims sole control of the terminals: it drives input and owns the size, and
    /// every other viewport shows a takeover screen. Triggers a `Control` broadcast.
    TakeControl,
    /// The desktop window's focus changed. While focused, the daemon suppresses agent-event sounds
    /// and banners (the user is already looking at the app). The native shells report this; other
    /// viewers leave it alone.
    SetFocused {
        focused: bool,
    },
    /// This viewport renders notifications itself (the Electron shell shows native banners with the
    /// app identity), so the daemon routes them here as `Notify` messages instead of firing its own.
    NotificationsNative {
        enabled: bool,
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
    Output {
        session: String,
        data: String,
    },
    Status {
        session: String,
        status: Status,
    },
    /// A desktop banner to show natively. Routed to a viewer that opted in via
    /// `NotificationsNative` (the Electron shell), and only while such a viewer is connected —
    /// otherwise the daemon fires the notification itself. `title` is the app name, `body` the text.
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
    SkillList {
        session: String,
        skills: Vec<Skill>,
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
    /// A device was just paired; `device.pairingUrl` is shown as a QR to scan.
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
    /// The resolved relay + web URLs (reply to `GetRemoteConfig` / `SetRemoteConfig`).
    RemoteConfig {
        config: RemoteConfig,
    },
    /// Who controls the terminals right now, from this viewport's perspective. `holder` is `None`
    /// when this viewport is the controller (render the terminal); otherwise it names the device in
    /// control (show a takeover screen). Pushed whenever control changes.
    Control {
        #[serde(default, skip_serializing_if = "Option::is_none")]
        #[cfg_attr(feature = "ts", ts(optional))]
        holder: Option<String>,
    },
    /// Structured transcript events for a session's chat view (the mobile viewport renders these
    /// instead of the terminal). Sent in a batch on attach (the accumulated log) and one-at-a-time
    /// as the transcript is tailed. A session with no transcript (no chat) simply never sends these.
    Chat {
        session: String,
        events: Vec<ChatEvent>,
    },
    /// The session's transcript restarted (a new or resumed conversation); the chat view clears
    /// before the fresh events arrive.
    ChatReset {
        session: String,
    },
    /// The assistant message currently streaming in, as cumulative text (each update replaces the
    /// last). An empty string clears the live message — it has committed as a `Chat` event or the
    /// turn ended. Only headless "chat" sessions emit these.
    ChatDelta {
        session: String,
        text: String,
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
/// the user sees what they're approving.
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
}

/// A file pasted or attached to a chat turn: base64 `data` plus its MIME type. Images and PDFs go to
/// the agent as image / document content blocks; text files are inlined as text.
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
        #[serde(default, skip_serializing_if = "Vec::is_empty")]
        files: Vec<ChatFile>,
    },
    /// Assistant prose (markdown).
    Assistant { text: String },
    /// Assistant reasoning, shown collapsed.
    Thinking { text: String },
    /// A tool the assistant invoked. `path` is the file it touched (if any); `body` is a renderable
    /// summary (a shell command, a diff, or short JSON).
    Tool {
        id: String,
        name: String,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        #[cfg_attr(feature = "ts", ts(optional))]
        path: Option<String>,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        #[cfg_attr(feature = "ts", ts(optional))]
        body: Option<String>,
    },
    /// The result of a tool call, tied to it by `id`.
    ToolResult { id: String, ok: bool, text: String },
    /// A system notice, not conversation (e.g. the turn was interrupted). Rendered as a centered
    /// marker, not a user/assistant message.
    Notice { text: String },
}
