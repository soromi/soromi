use std::collections::HashMap;

use serde::{Deserialize, Serialize};

/// One provider's isolation config within an account profile: the env vars and/or config
/// directory that give this account its own logged-in session.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[cfg_attr(feature = "ts", derive(ts_rs::TS))]
#[serde(rename_all = "camelCase")]
#[cfg_attr(
    feature = "ts",
    ts(export, export_to = "../../../packages/protocol/src/generated/")
)]
pub struct ProviderConfig {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[cfg_attr(feature = "ts", ts(optional))]
    pub env: Option<HashMap<String, String>>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[cfg_attr(feature = "ts", ts(optional))]
    pub config_dir: Option<String>,
}

/// A named account profile stored under `~/.soromi/accounts/<name>/`. Workspaces reference it
/// by name; secrets never enter the committable `soromi.space.json`.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[cfg_attr(feature = "ts", derive(ts_rs::TS))]
#[cfg_attr(
    feature = "ts",
    ts(export, export_to = "../../../packages/protocol/src/generated/")
)]
pub struct AccountProfile {
    pub name: String,
    pub providers: HashMap<String, ProviderConfig>,
}
