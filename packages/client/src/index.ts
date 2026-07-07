// Transport
export { LocalWebSocketTransport } from './transport/local-websocket-transport'
export { TransportProvider, useTransport } from './transport/transport-context'

// Terminal
export { TerminalSurface } from './terminal/terminal-surface'

// Store (daemon-mirrored state)
export { useClientStore } from './store/client-store'

export type { Transport } from './transport/transport'
export type { AppUpdate, WorkspaceInfo } from './store/client-store'
