use serde::{Deserialize, Serialize};

/// Optional per-workspace defaults; the top-level fields win when both are set.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceDefaults {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub agent: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub account: Option<String>,
}

/// The committable descriptor at the root of a work folder (`soromi.space.json`). References
/// the account profile by name only; zero secrets live here. Mirrors `WorkspaceSchema`.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct Workspace {
    pub name: String,
    pub folders: Vec<String>,
    pub agent: String,
    pub account: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub defaults: Option<WorkspaceDefaults>,
}

/// A persisted space: the committable config plus its absolute root on disk.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct PersistedSpace {
    pub name: String,
    pub folders: Vec<String>,
    pub agent: String,
    pub account: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub defaults: Option<WorkspaceDefaults>,
    pub root: String,
}
