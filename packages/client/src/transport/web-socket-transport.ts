import { PROTOCOL_VERSION } from '@soromi/protocol'

//Utils
import { decodePayload } from './frames'

//Types
import type { ClientMessage, ServerMessage } from '@soromi/protocol'
import type { Transport } from './transport'

const INITIAL_DELAY = 500
const MAX_DELAY = 5000

const CLIENT_ID_KEY = 'soromi.clientId'

/** A stable id for this install, announced in `hello`. Kept in local storage where there is one. */
function clientId(): string {
  try {
    const stored = localStorage.getItem(CLIENT_ID_KEY)
    if (stored) return stored
    const created = crypto.randomUUID()
    localStorage.setItem(CLIENT_ID_KEY, created)

    return created
  } catch {
    return crypto.randomUUID()
  }
}

/**
 * A reconnecting WebSocket transport. Subclasses point it at a URL and, if needed, override
 * `encode`/`open` to wrap frames (e.g. the relay transport adds end-to-end encryption there); the
 * reconnect, queue, handshake, and listener plumbing stays shared.
 *
 * The transport counts as open once the daemon can actually be reached: as soon as the socket opens
 * on a direct link, or when the relay reports the daemon present on a relay link (`awaitsPeer`).
 * Each time that happens it says `hello` first, then sends whatever was queued, then tells its open
 * listeners — so everything a listener sends follows the handshake.
 */
export abstract class WebSocketTransport implements Transport {
  private socket: WebSocket | null = null
  private readonly messageListeners = new Set<(message: ServerMessage) => void>()
  private readonly outputListeners = new Set<(session: string, data: string) => void>()
  private readonly openListeners = new Set<() => void>()
  private readonly closeListeners = new Set<() => void>()
  private readonly presenceListeners = new Set<(present: boolean) => void>()
  /** Which session each binary terminal slot belongs to, from the daemon's `attached` replies. */
  private readonly slots = new Map<number, string>()
  private readonly clientId = clientId()
  private queued: ClientMessage[] = []
  private closedByUser = false
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null
  private reconnectDelay = INITIAL_DELAY
  /** Whether the daemon is reachable right now (see the class note). */
  private ready = false

  /** Set by a transport that reaches the daemon through a relay and must wait for it to be there. */
  protected awaitsPeer = false

  constructor(private readonly url: string) {}

  /** Turns a client message into a frame to send. Default: JSON text. Override to encrypt. */
  protected encode(message: ClientMessage): string | ArrayBufferLike {
    return JSON.stringify(message)
  }

  /** Unwraps a received frame to its payload (JSON text or raw bytes). Override to decrypt. */
  protected open(data: unknown): string | Uint8Array | null {
    if (typeof data === 'string') return data
    if (data instanceof ArrayBuffer) return new Uint8Array(data)

    return null
  }

  connect(): void {
    this.closedByUser = false
    // Drop any existing socket first (e.g. a manual "Reconnect" tapped while one is still open),
    // detaching its handlers so it neither fires our close listeners nor schedules a reconnect.
    // Otherwise two sockets share the relay room and the peer count reads as a phantom daemon.
    const previous = this.socket
    if (previous) {
      previous.onopen = null
      previous.onmessage = null
      previous.onclose = null
      previous.close()
    }
    this.ready = false

    const socket = new WebSocket(this.url)
    socket.binaryType = 'arraybuffer'
    socket.onopen = () => {
      this.reconnectDelay = INITIAL_DELAY
      if (!this.awaitsPeer) this.becomeReady(socket)
    }
    socket.onmessage = (event) => {
      // Relay presence control frames arrive as plaintext text, even on an encrypted link; they are
      // not daemon messages. On a relay link they report whether the daemon peer is attached.
      if (typeof event.data === 'string') {
        const present = parsePresence(event.data)
        if (present !== null) {
          if (this.awaitsPeer) {
            if (present && !this.ready) this.becomeReady(socket)
            if (!present) this.ready = false
          }
          for (const listener of this.presenceListeners) listener(present)
          return
        }
      }
      const payload = this.open(event.data)
      if (payload === null) return
      const decoded = decodePayload(payload, this.slots)
      if (decoded === null) return
      if (decoded.kind === 'output') {
        for (const listener of this.outputListeners) listener(decoded.session, decoded.data)
        return
      }
      const { message } = decoded
      // Slot assignments are the transport's business: they only say how to read binary frames.
      if (message.type === 'attached') {
        this.slots.set(message.slot, message.session)
        return
      }
      for (const listener of this.messageListeners) listener(message)
    }
    socket.onclose = () => {
      this.ready = false
      for (const listener of this.closeListeners) listener()
      if (!this.closedByUser) this.scheduleReconnect()
    }
    this.socket = socket
  }

  send(message: ClientMessage): void {
    const socket = this.socket
    if (socket && socket.readyState === WebSocket.OPEN && this.ready) {
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

  onOutput(listener: (session: string, data: string) => void): () => void {
    this.outputListeners.add(listener)
    return () => {
      this.outputListeners.delete(listener)
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

  onPresence(listener: (present: boolean) => void): () => void {
    this.presenceListeners.add(listener)
    return () => {
      this.presenceListeners.delete(listener)
    }
  }

  isOpen(): boolean {
    return this.socket?.readyState === WebSocket.OPEN && this.ready
  }

  close(): void {
    this.closedByUser = true
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer)
      this.reconnectTimer = null
    }
    this.socket?.close()
    this.socket = null
    this.ready = false
    this.messageListeners.clear()
    this.outputListeners.clear()
    this.openListeners.clear()
    this.closeListeners.clear()
    this.presenceListeners.clear()
    this.queued = []
  }

  /**
   * The daemon just became reachable on `socket`. It starts every client from scratch on `hello`,
   * so the slots it assigned before are void; say hello, flush the queue, then tell listeners.
   */
  private becomeReady(socket: WebSocket): void {
    this.ready = true
    this.slots.clear()
    socket.send(this.encode({ type: 'hello', protocol: PROTOCOL_VERSION, clientId: this.clientId }))
    for (const message of this.queued) socket.send(this.encode(message))
    this.queued = []
    for (const listener of this.openListeners) listener()
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

/**
 * Parses a relay presence control frame (`{"__relay":"presence","peers":n}`), returning whether the
 * other peer (the daemon) is present (`peers > 1`). Returns `null` for any other frame.
 */
function parsePresence(text: string): boolean | null {
  if (!text.includes('"__relay"')) return null
  try {
    const value = JSON.parse(text) as { __relay?: string; peers?: number }
    if (value.__relay !== 'presence') return null

    return (value.peers ?? 0) > 1
  } catch {
    return null
  }
}
