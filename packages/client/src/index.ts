// What every client shares lives in `@soromi/core` (transport, store, pairing). This package binds
// it to React and the DOM for the desktop: the store as a hook, the transport as context, and the
// xterm terminal.

// Transport
export { LocalWebSocketTransport, RelayTransport } from '@soromi/core'
export { TransportProvider, useTransport } from './transport/transport-context'
export { browserClientId } from './transport/client-id'

// Terminal
export { TerminalSurface } from './terminal/terminal-surface'
export { TakeoverBar } from './terminal/takeover'

// Store (daemon-mirrored state)
export { useClientStore } from './store/client-store'
export {
  agentLabel,
  agentOptionsFor,
  applyServerMessage,
  deferredFiles,
  groupChanges,
  repoKey,
  repoLabel,
  repoToShow,
  runningAgents,
  sessionAgentFor,
  sessionStatus,
  splitPath,
} from '@soromi/core'

// Hooks
export { useUsage } from './hooks/use-usage'

export type { AppUpdate, RelayConfig, Transport, WorkspaceInfo } from '@soromi/core'
