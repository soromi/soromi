import { type ClientMessage, type ServerMessage, ServerMessageSchema } from '@soromi/protocol'

//Types
import type { Transport } from './transport'

const INITIAL_DELAY = 500
const MAX_DELAY = 5000

/** Transport over a direct WebSocket to the local daemon, with auto-reconnect. */
export class LocalWebSocketTransport implements Transport {
  private socket: WebSocket | null = null
  private readonly messageListeners = new Set<(message: ServerMessage) => void>()
  private readonly openListeners = new Set<() => void>()
  private readonly closeListeners = new Set<() => void>()
  private queued: ClientMessage[] = []
  private closedByUser = false
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null
  private reconnectDelay = INITIAL_DELAY

  constructor(private readonly url: string) {}

  connect(): void {
    this.closedByUser = false
    const socket = new WebSocket(this.url)
    socket.onopen = () => {
      this.reconnectDelay = INITIAL_DELAY
      for (const message of this.queued) socket.send(JSON.stringify(message))
      this.queued = []
      for (const listener of this.openListeners) listener()
    }
    socket.onmessage = (event) => {
      const parsed = ServerMessageSchema.safeParse(parseJson(event.data))
      if (!parsed.success) return
      for (const listener of this.messageListeners) listener(parsed.data)
    }
    socket.onclose = () => {
      for (const listener of this.closeListeners) listener()
      if (!this.closedByUser) this.scheduleReconnect()
    }
    this.socket = socket
  }

  send(message: ClientMessage): void {
    const socket = this.socket
    if (socket && socket.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify(message))
    } else {
      this.queued.push(message)
    }
  }

  onMessage(listener: (message: ServerMessage) => void): () => void {
    this.messageListeners.add(listener)
    return () => {
      this.messageListeners.delete(listener)
    }
  }

  onOpen(listener: () => void): () => void {
    this.openListeners.add(listener)
    return () => {
      this.openListeners.delete(listener)
    }
  }

  onClose(listener: () => void): () => void {
    this.closeListeners.add(listener)
    return () => {
      this.closeListeners.delete(listener)
    }
  }

  isOpen(): boolean {
    return this.socket?.readyState === WebSocket.OPEN
  }

  close(): void {
    this.closedByUser = true
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer)
      this.reconnectTimer = null
    }
    this.socket?.close()
    this.socket = null
    this.messageListeners.clear()
    this.openListeners.clear()
    this.closeListeners.clear()
    this.queued = []
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimer) return
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null
      this.reconnectDelay = Math.min(this.reconnectDelay * 2, MAX_DELAY)
      this.connect()
    }, this.reconnectDelay)
  }
}

function parseJson(data: unknown): unknown {
  if (typeof data !== 'string') return null
  try {
    return JSON.parse(data)
  } catch {
    return null
  }
}
