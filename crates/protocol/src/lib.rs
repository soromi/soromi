//! Wire protocol shared across the Soromi daemon and viewport.
//!
//! These types mirror the TypeScript `@soromi/protocol` zod schemas one-for-one. During the
//! Rust migration zod stays the source of truth for the GUI and the Node daemon; the
//! conformance tests (`tests/wire.rs`) pin the exact JSON wire format so the two never drift.

pub mod account;
pub mod messages;
pub mod status;

pub use account::{AccountProfile, ProviderConfig};
pub use messages::{
    AgentAccount, AgentUsage, ClientMessage, DeviceSummary, DirEntry, EntryKind, ServerMessage,
    SessionSummary, Skill, SkillKind, SkillScope, UsageWindow, WorkspaceSummary,
};
pub use status::{KeepAwakeMode, Status};
