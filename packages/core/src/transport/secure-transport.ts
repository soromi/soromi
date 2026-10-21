import { DeviceLink, decodeKey } from './relay-crypto'
import { WebSocketTransport } from './web-socket-transport'

//Types
import type { ClientMessage } from '@soromi/protocol'
import type { TransportOptions } from './web-socket-transport'

/** How long to wait for the daemon to accept a session before asking again. */
const OPEN_RETRY_MS = 5000

const encoder = new TextEncoder()

/**
 * A transport whose link to the daemon is end-to-end encrypted with a paired device's key,
 * whichever way the socket gets there (through the relay, or straight to the computer). Each time
 * the daemon becomes reachable the two agree on a fresh session, and every frame after that is
 * sealed with the session's keys; nothing in between can read or replay them.
 *
 * Without a key frames go out as they are, which only a development relay link does.
 */
export abstract class SecureTransport extends WebSocketTransport {
  private readonly link?: DeviceLink
  /** Called once the daemon accepts the session being asked for. */
  private accepted: (() => void) | null = null
  private retry: ReturnType<typeof setInterval> | null = null

  constructor(url: string, key: string | undefined, options: TransportOptions) {
    super(url, options)

    if (key) {
      this.link = new DeviceLink(decodeKey(key))
    }
  }

  protected override prepare(send: (frame: Uint8Array) => void, ready: () => void): void {
    const link = this.link
    if (!link) {
      ready()
      return
    }
    // Each request replaces the one before it, and the daemon's answer names the request it is
    // for, so asking again is safe even if an earlier answer is still on its way.
    const ask = () => send(link.open())
    this.accepted = ready
    this.retry = setInterval(ask, OPEN_RETRY_MS)
    ask()
  }

  protected override reset(): void {
    if (this.retry) clearInterval(this.retry)
    this.retry = null
    this.accepted = null
    this.link?.end()
  }

  protected override encode(message: ClientMessage): string | Uint8Array | null {
    if (!this.link) return super.encode(message)

    return this.link.seal(encoder.encode(JSON.stringify(message)))
  }

  protected override open(data: unknown): string | Uint8Array | null {
    if (!this.link) return super.open(data)
    if (!(data instanceof ArrayBuffer)) return null

    const received = this.link.receive(new Uint8Array(data))
    if (received?.kind === 'accepted') {
      const accepted = this.accepted
      if (this.retry) clearInterval(this.retry)
      this.retry = null
      this.accepted = null
      accepted?.()

      return null
    }

    return received?.payload ?? null
  }
}
