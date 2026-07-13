import { decodeKey, open, seal } from './relay-crypto'
import { WebSocketTransport } from './web-socket-transport'

//Types
import type { ClientMessage, ServerMessage } from '@soromi/protocol'

export interface RelayConfig {
  /** The relay's base URL, e.g. `wss://relay.soromi.app` or `ws://localhost:8787`. */
  relayUrl: string
  /** The room id shared with the desktop daemon (from pairing). */
  room: string
  /** Base64 32-byte end-to-end key (from pairing). Without it, frames are plaintext (dev only). */
  key?: string
}

/**
 * Transport to the daemon through the relay: dials `<relayUrl>/?room=<room>` and speaks the same
 * protocol. The relay is a content-blind pipe. With a `key`, every frame is XChaCha20-Poly1305
 * end-to-end encrypted (the relay sees only ciphertext) by overriding the base encode/decode hooks.
 */
export class RelayTransport extends WebSocketTransport {
  private readonly key?: Uint8Array

  constructor(config: RelayConfig) {
    super(`${config.relayUrl.replace(/\/$/, '')}/?room=${encodeURIComponent(config.room)}`)

    if (config.key) {
      this.key = decodeKey(config.key)
    }
  }

  protected override encode(message: ClientMessage): string | ArrayBufferLike {
    if (!this.key) return super.encode(message)

    return seal(this.key, new TextEncoder().encode(JSON.stringify(message)))
  }

  protected override decode(data: unknown): ServerMessage | null {
    if (!this.key) return super.decode(data)
    if (!(data instanceof ArrayBuffer)) return null

    const plaintext = open(this.key, data)
    if (!plaintext) return null

    try {
      return JSON.parse(new TextDecoder().decode(plaintext)) as ServerMessage
    } catch {
      return null
    }
  }
}
