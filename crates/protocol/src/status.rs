use serde::{Deserialize, Serialize};

/// Agent lifecycle status. Source of truth for the GUI's `Status` type.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[cfg_attr(feature = "ts", derive(ts_rs::TS))]
#[serde(rename_all = "kebab-case")]
#[cfg_attr(
    feature = "ts",
    ts(export, export_to = "../../../packages/protocol/src/generated/")
)]
pub enum Status {
    Thinking,
    Done,
    Blocked,
    WaitingInput,
    Idle,
}

/// How aggressively the daemon holds the machine awake.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[cfg_attr(feature = "ts", derive(ts_rs::TS))]
#[serde(rename_all = "kebab-case")]
#[cfg_attr(
    feature = "ts",
    ts(export, export_to = "../../../packages/protocol/src/generated/")
)]
pub enum KeepAwakeMode {
    Off,
    Working,
    Always,
}
