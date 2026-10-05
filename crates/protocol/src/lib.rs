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
    AgentAccount, AgentUsage, ChatEvent, ChatFile, ClientMessage, DeviceSummary, DirEntry,
    EntryKind, GitChange, GitStatusInfo, IncompatibleAction, ModelOption, PermissionMode,
    ProviderModels, RemoteConfig, ServerMessage, SessionMode, SessionSummary, Skill, SkillKind,
    SkillScope, SlashCommand, SubAgent, ToolApproval, ToolKind, UsageWindow, WorkspaceSummary,
};
pub use status::{KeepAwakeMode, Status};

/// The wire protocol version a current client announces in `Hello`. Bump it on any change an older
/// peer would misread. Mirrored as `PROTOCOL_VERSION` in `packages/protocol/src/index.ts`; the
/// `protocol_version_matches_the_typescript_constant` test keeps the two in step.
pub const PROTOCOL_VERSION: u32 = 2;

/// Opcode of a binary terminal-output frame: `[TERMINAL_OUTPUT][slot, big-endian u16][utf-8]`.
/// Never `{` (0x7B), so a frame's first byte tells binary from JSON.
pub const TERMINAL_OUTPUT: u8 = 0x01;

#[cfg(test)]
mod tests {
    #[test]
    fn protocol_version_matches_the_typescript_constant() {
        let index = include_str!("../../../packages/protocol/src/index.ts");
        let expected = format!(
            "export const PROTOCOL_VERSION = {}",
            super::PROTOCOL_VERSION
        );
        assert!(
            index.contains(&expected),
            "expected `{expected}` in index.ts"
        );
    }
}
