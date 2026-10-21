import { PROTOCOL_VERSION } from '@soromi/protocol'

//Utils
import { decodePayload } from './frames'

//Types
import type { ClientMessage, ServerMessage } from '@soromi/protocol'
import type { Transport } from './transport'

const INITIAL_DELAY = 500
const MAX_DELAY = 5000

/** The close codes a relay sends, so a client can tell why it was turned away. */
export const relayClose = {
  /**
   * Another socket joined the room in this one's role and took its place: this pairing was opened
   * somewhere else. Dialing back would only take the room from that one in turn, so the transport
   * stays down.
   */
  replaced: 4002,
  /** The room has no daemon in it: the computer is off, asleep, or not running Soromi. */
  noHost: 4004,
} as const

export interface TransportOptions {
  /**
   * A stable id for this install, announced in `hello`. The host keeps it wherever it keeps such
   * things (local storage in a webview, the keychain on a phone).
   */
  clientId: string
  /**
   * Whether to dial again, with a growing delay, each time the socket drops. On unless set to
   * `false`, for a link that is one attempt among several and is replaced rather than retried.
   */
  reconnect?: boolean
}

/**
 * A reconnecting WebSocket transport. Subclasses point it at a URL and, if needed, override
 * `encode`/`open` to wrap frames and `prepare`/`reset` to set a link up first (the relay transport
 * adds end-to-end encryption there); the reconnect, queue, handshake, and listener plumbing stays
 * shared.
 *
 * The transport counts as open once the daemon can actually be reached: as soon as the socket opens
 * on a direct link, or when the relay reports the daemon present on a relay link (`awaitsPeer`),
 * and `prepare` is done. Each time that happens it says `hello` first, then sends whatever was
 * queued, then tells its open listeners — so everything a listener sends follows the handshake.
 */
export abstract class WebSocketTransport implements Transport {
  private socket: WebSocket | null = null
  private readonly messageListeners = new Set<(message: ServerMessage) => void>()
  private readonly outputListeners = new Set<(session: string, data: string) => void>()
  private readonly openListeners = new Set<() => void>()
  private readonly closeListeners = new Set<(code: number) => void>()
  private readonly presenceListeners = new Set<(present: boolean) => void>()
  /** Which session each binary terminal slot belongs to, from the daemon's `attached` replies. */
  private readonly slots = new Map<number, string>()
  private readonly clientId: string
  private readonly reconnects: boolean
  private queued: ClientMessage[] = []
  private closedByUser = false
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null
  private reconnectDelay = INITIAL_DELAY
  /** Whether the daemon is reachable right now (see the class note). */
  private ready = false
  /** Whether `prepare` is under way for the current socket. */
  private preparing = false
  /** Whether the daemon has answered this link's `hello`. Until then nothing it sends is for us. */
  private welcomed = false

  /** Set by a transport that reaches the daemon through a relay and must wait for it to be there. */
  protected awaitsPeer = false

  constructor(
    private readonly url: string,
    options: TransportOptions,
  ) {
    this.clientId = options.clientId
    this.reconnects = options.reconnect ?? true
  }

  /**
   * Turns a client message into a frame to send, or `null` if it cannot be sent right now. Default:
   * JSON text. Override to encrypt.
   */
  protected encode(message: ClientMessage): string | Uint8Array | null {
    return JSON.stringify(message)
  }

  /**
   * Sets the link up once the daemon is reachable and before any message is sent. `send` puts a raw
   * frame on the socket; `ready` is called when messages can be exchanged. Default: nothing to set
   * up. Override to run a handshake first.
   */
  protected prepare(_send: (frame: Uint8Array) => void, ready: () => void): void {
    ready()
  }

  /** Drops whatever `prepare` set up: the daemon is no longer reachable. Default: nothing. */
  protected reset(): void {}

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
    this.unreach()

    const socket = new WebSocket(this.url)
    socket.binaryType = 'arraybuffer'
    socket.onopen = () => {
      this.reconnectDelay = INITIAL_DELAY
      if (!this.awaitsPeer) this.reach(socket)
    }
    socket.onmessage = (event) => {
      // Relay presence control frames arrive as plaintext text, even on an encrypted link; they are
      // not daemon messages. On a relay link they report whether the daemon peer is attached.
      if (typeof event.data === 'string') {
        const present = parsePresence(event.data)
        if (present !== null) {
          if (this.awaitsPeer) {
            if (present) this.reach(socket)
            else this.unreach()
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
      // Anything ahead of the answer to our hello was meant for whoever had this link before.
      if (!this.welcomed) {
        if (message.type === 'welcome') this.welcomed = true
        else if (message.type !== 'incompatible') return
      }
      // Slot assignments are the transport's business: they only say how to read binary frames.
      if (message.type === 'attached') {
        this.slots.set(message.slot, message.session)
        return
      }
      for (const listener of this.messageListeners) listener(message)
    }
    socket.onclose = (event) => {
      this.unreach()
      for (const listener of this.closeListeners) listener(event.code)
      if (this.closedByUser || !this.reconnects || event.code === relayClose.replaced) return
      this.scheduleReconnect()
    }
    this.socket = socket
  }

  send(message: ClientMessage): void {
    const socket = this.socket
    if (socket && socket.readyState === WebSocket.OPEN && this.ready) {
      this.transmit(socket, message)
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

  onClose(listener: (code: number) => void): () => void {
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
    this.unreach()
    this.messageListeners.clear()
    this.outputListeners.clear()
    this.openListeners.clear()
    this.closeListeners.clear()
    this.presenceListeners.clear()
    this.queued = []
  }

  /** The daemon can be reached on `socket`: set the link up, then start talking. */
  private reach(socket: WebSocket): void {
    if (this.ready || this.preparing) return
    this.preparing = true
    this.prepare(
      (frame) => {
        if (this.socket === socket && socket.readyState === WebSocket.OPEN) socket.send(frame)
      },
      () => {
        if (this.socket !== socket || !this.preparing) return
        this.preparing = false
        this.becomeReady(socket)
      },
    )
  }

  /** The daemon can no longer be reached (or is about to be dialed again). */
  private unreach(): void {
    this.ready = false
    this.preparing = false
    this.reset()
  }

  /**
   * The link to the daemon on `socket` is set up. The daemon starts every client from scratch on
   * `hello`, so the slots it assigned before are void; say hello, flush the queue, then tell
   * listeners.
   */
  private becomeReady(socket: WebSocket): void {
    this.ready = true
    this.welcomed = false
    this.slots.clear()
    this.transmit(socket, { type: 'hello', protocol: PROTOCOL_VERSION, clientId: this.clientId })
    for (const message of this.queued) this.transmit(socket, message)
    this.queued = []
    for (const listener of this.openListeners) listener()
  }

  private transmit(socket: WebSocket, message: ClientMessage): void {
    const frame = this.encode(message)
    if (frame !== null) socket.send(frame)
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
