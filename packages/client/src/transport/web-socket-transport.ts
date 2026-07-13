//Types
import type { ClientMessage, ServerMessage } from '@soromi/protocol'
import type { Transport } from './transport'

const INITIAL_DELAY = 500
const MAX_DELAY = 5000

/**
 * A reconnecting WebSocket transport. Subclasses point it at a URL and, if needed, override
 * `encode`/`decode` to wrap frames (e.g. the relay transport adds end-to-end encryption there);
 * the reconnect, queue, and listener plumbing stays shared.
 */
export abstract class WebSocketTransport implements Transport {
  private socket: WebSocket | null = null
  private readonly messageListeners = new Set<(message: ServerMessage) => void>()
  private readonly openListeners = new Set<() => void>()
  private readonly closeListeners = new Set<() => void>()
  private queued: ClientMessage[] = []
  private closedByUser = false
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null
  private reconnectDelay = INITIAL_DELAY

  constructor(private readonly url: string) {}

  /** Turns a client message into a frame to send. Default: JSON text. Override to encrypt. */
  protected encode(message: ClientMessage): string | ArrayBufferLike {
    return JSON.stringify(message)
  }

  /** Turns a received frame into a server message, or null if it cannot. Override to decrypt. */
  protected decode(data: unknown): ServerMessage | null {
    if (typeof data !== 'string') return null
    try {
      return JSON.parse(data) as ServerMessage
    } catch {
      return null
    }
  }

  connect(): void {
    this.closedByUser = false
    const socket = new WebSocket(this.url)
    socket.binaryType = 'arraybuffer'
    socket.onopen = () => {
      this.reconnectDelay = INITIAL_DELAY
      for (const message of this.queued) socket.send(this.encode(message))
      this.queued = []
      for (const listener of this.openListeners) listener()
    }
    socket.onmessage = (event) => {
      const message = this.decode(event.data)
      if (message === null) return
      for (const listener of this.messageListeners) listener(message)
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
      socket.send(this.encode(message))
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
