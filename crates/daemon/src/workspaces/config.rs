use serde::{Deserialize, Serialize};
use soromi_protocol::AgentAccount;

/// One tab within a workspace: a stable id plus the agent it runs. Its account is resolved
/// from the workspace's `accounts` bindings by matching the agent.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct SessionSpec {
    pub id: String,
    pub agent: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub title: Option<String>,
}

/// The committable descriptor at the root of a work folder (`soromi.space.json`). References
/// account profiles by name only; zero secrets live here.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct Workspace {
    pub name: String,
    pub folders: Vec<String>,
    /// Which account each agent runs under, one entry per agent.
    pub accounts: Vec<AgentAccount>,
}

/// A persisted space under `~/.soromi/spaces.json`: the committable config plus its absolute
/// root and its live tab list. `agent`/`account` are legacy single-session fields kept only so
/// pre-tabs files still load; they are migrated into `accounts`/`sessions` and never written.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct PersistedSpace {
    pub name: String,
    pub folders: Vec<String>,
    pub root: String,
    #[serde(default)]
    pub accounts: Vec<AgentAccount>,
    #[serde(default)]
    pub sessions: Vec<SessionSpec>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub agent: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub account: Option<String>,
}
