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

/// One running terminal (tab) within a workspace. `account` is resolved from the workspace's
/// account bindings by matching `agent`.
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
    /// A user-set tab name. Absent means the tab shows its account (auto-indexed on collision).
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[cfg_attr(feature = "ts", ts(optional))]
    pub title: Option<String>,
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
    },
    CloseSession {
        session: String,
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
    /// List paired devices (for the settings screen). Replies with `DeviceList`.
    ListDevices,
    /// Revoke a paired device: forget it and stop dialing its relay room. Replies with `DeviceList`.
    RevokeDevice {
        id: String,
    },
}

/// Daemon -> viewport. A discriminated union on `type`.
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
pub enum ServerMessage {
    Output {
        session: String,
        data: String,
    },
    Status {
        session: String,
        status: Status,
    },
    Notify {
        workspace: String,
        status: Status,
        message: String,
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
}
