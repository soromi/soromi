import { WebSocketTransport } from './web-socket-transport'

/** Transport over a direct WebSocket to the local daemon (plain JSON, with auto-reconnect). */
export class LocalWebSocketTransport extends WebSocketTransport {}
