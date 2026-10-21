// Wire protocol types for the GUI. Generated from the Rust `crates/protocol` (the single
// source of truth) via ts-rs. Regenerate with `pnpm gen:protocol`. Do not edit `generated/`.

export type { AccountProfile } from './generated/AccountProfile'
export type { AgentAccount } from './generated/AgentAccount'
export type { AgentUsage } from './generated/AgentUsage'
export type { ChatCursor } from './generated/ChatCursor'
export type { ChatEvent } from './generated/ChatEvent'
export type { ChatFile } from './generated/ChatFile'
export type { ClientMessage } from './generated/ClientMessage'
export type { DeviceRoute } from './generated/DeviceRoute'
export type { DeviceSummary } from './generated/DeviceSummary'
export type { DirEntry } from './generated/DirEntry'
export type { EntryKind } from './generated/EntryKind'
export type { GitChange } from './generated/GitChange'
export type { GitStatusInfo } from './generated/GitStatusInfo'
export type { IncompatibleAction } from './generated/IncompatibleAction'
export type { ModelOption } from './generated/ModelOption'
export type { ProviderModels } from './generated/ProviderModels'
export type { KeepAwakeMode } from './generated/KeepAwakeMode'
export type { PermissionMode } from './generated/PermissionMode'
export type { ProviderConfig } from './generated/ProviderConfig'
export type { RemoteConfig } from './generated/RemoteConfig'
export type { RemoteDefaults } from './generated/RemoteDefaults'
export type { ServerMessage } from './generated/ServerMessage'
export type { SessionMode } from './generated/SessionMode'
export type { SessionSummary } from './generated/SessionSummary'
export type { SlashCommand } from './generated/SlashCommand'
export type { SubAgent } from './generated/SubAgent'
export type { Skill } from './generated/Skill'
export type { SkillKind } from './generated/SkillKind'
export type { SkillScope } from './generated/SkillScope'
export type { Status } from './generated/Status'
export type { ToolApproval } from './generated/ToolApproval'
export type { ToolKind } from './generated/ToolKind'
export type { UsageWindow } from './generated/UsageWindow'
export type { WorkspaceSummary } from './generated/WorkspaceSummary'

/** The wire protocol version this client speaks, announced in `hello`. Mirrors `PROTOCOL_VERSION`
 * in `crates/protocol/src/lib.rs` (a Rust test fails if the two drift). */
export const PROTOCOL_VERSION = 3

/** Opcode of a binary terminal-output frame: `[TERMINAL_OUTPUT][slot, big-endian u16][utf-8]`. */
export const TERMINAL_OUTPUT = 0x01
