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
    pub folders: Vec<String>,
    pub accounts: Vec<AgentAccount>,
    pub sessions: Vec<SessionSummary>,
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
}
