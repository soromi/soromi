// Transport
export { LocalWebSocketTransport } from './transport/local-websocket-transport'
export { RelayTransport } from './transport/relay-transport'
export { RoutedTransport } from './transport/routed-transport'
export { relayClose } from './transport/web-socket-transport'

// Store (daemon-mirrored state)
export { agentLogKey, createClientStore } from './store/client-store'
export { applyServerMessage } from './store/apply-message'
export { deferredFiles } from './store/chat-log'

// Chat
export { WORKING_WORDS, WORKING_WORD_MS, formatElapsed, formatTokens } from './chat/working'
export {
  contextLimit,
  effortLabel,
  modelSummary,
  modelsFor,
  normalizeModelCatalog,
  selectedEffort,
  selectedModel,
} from './chat/models'
export { PERMISSION_MODES, permissionLabel } from './chat/permissions'
export { CONTEXT_WARN_PERCENT, contextPercent, isContextFilling } from './chat/context'
export { runningAgents, sessionStatus } from './sessions/status'
export {
  CONVERSATION_SEARCH_MS,
  conversationAge,
  conversationQuery,
  isStaleList,
  openTabOf,
} from './sessions/conversations'
export {
  USAGE_REFRESH_MS,
  usageAgentName,
  usageFill,
  usageGlance,
  usageLevel,
  usageManageUrl,
  usageResets,
  usageSoonestReset,
  usageSummary,
  usageWindowLabel,
} from './usage/usage'
export { buildRows } from './chat/rows'
export { commandText, matchCommands, slashQuery } from './chat/slash'
export {
  diffStat,
  summarizeTools,
  toolDiff,
  toolHasBody,
  toolInput,
  toolOpensByDefault,
  toolState,
  toolTarget,
  toolVerb,
} from './chat/tools'
export {
  agentLabel,
  agentOptionKey,
  agentOptionsFor,
  isCurrentAgent,
  sessionAgentFor,
} from './chat/agents'

// Files
export { flattenTree, unlistedDirs } from './files/tree'
export { fileType } from './files/file-type'

// Git
export { groupChanges, splitPath } from './git/changes'
export { isBinaryDiff, parseDiff } from './git/diff'
export { repoKey, repoLabel, repoToShow } from './git/repos'

// Pairing
export { parsePairingCode } from './pairing/pairing-code'

// Workspaces (setting one up, and its settings)
export { basename, deriveRootAndFolders } from './workspaces/folders'
export {
  DEFAULT_ACCOUNT,
  SETUP_AGENTS,
  accountChoices,
  boundAccounts,
  createSpaceMessage,
  settingsAgents,
  updateSpaceMessage,
  workspaceFolderPaths,
} from './workspaces/setup'
export type { NewWorkspace, WorkspaceEdit } from './workspaces/setup'

export type { Transport } from './transport/transport'
export type { RelayConfig } from './transport/relay-transport'
export type { RoutedConfig } from './transport/routed-transport'
export type { TransportOptions } from './transport/web-socket-transport'
export type {
  AgentLog,
  AppUpdate,
  ClientState,
  ClientStore,
  ClientStoreOptions,
  Conversations,
  KeyValueStorage,
  WorkspaceInfo,
} from './store/client-store'
export type { DeferredFile } from './store/chat-log'
export type { UsageLevel } from './usage/usage'
export type { ModelCatalog, ModelOption, ProviderModels } from './chat/models'
export type { PermissionChoice } from './chat/permissions'
export type { ChatRow } from './chat/rows'
export type { ToolDiffLine, ToolItem, ToolResult, ToolState } from './chat/tools'
export type { AgentOption, SessionAgent } from './chat/agents'
export type { Pairing, PairingError, ParsedPairing } from './pairing/pairing-code'
export type { FileNode, TreeState } from './files/tree'
export type { FileKind, FileType } from './files/file-type'
export type { GroupedChanges } from './git/changes'
export type { DiffRow } from './git/diff'
