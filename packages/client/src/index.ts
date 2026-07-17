// Transport
export { LocalWebSocketTransport } from './transport/local-websocket-transport'
export { RelayTransport } from './transport/relay-transport'
export { TransportProvider, useTransport } from './transport/transport-context'

// Terminal
export { TerminalSurface } from './terminal/terminal-surface'
export { TakeoverScreen } from './terminal/takeover'

// Store (daemon-mirrored state)
export { useClientStore } from './store/client-store'

export type { Transport } from './transport/transport'
export type { RelayConfig } from './transport/relay-transport'
export type { AppUpdate, WorkspaceInfo } from './store/client-store'
