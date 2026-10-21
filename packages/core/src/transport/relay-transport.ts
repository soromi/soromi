import { SecureTransport } from './secure-transport'

//Types
import type { TransportOptions } from './web-socket-transport'

export interface RelayConfig {
  /** The relay's base URL, e.g. `wss://relay.soromi.app` or `ws://localhost:8787`. */
  relayUrl: string
  /** The room id shared with the desktop daemon (from pairing). */
  room: string
  /** Base64 32-byte end-to-end key (from pairing). Without it, frames are plaintext (dev only). */
  key?: string
}

/**
 * Transport to the daemon through the relay: dials `<relayUrl>/?room=<room>&role=device` and speaks
 * the same protocol. The relay is a content-blind pipe. With a `key`, the link is end-to-end
 * encrypted (the relay sees only ciphertext). The socket to the relay can be up with no daemon
 * behind it, so this transport only counts as open while the relay reports the daemon present and
 * a session is on.
 */
export class RelayTransport extends SecureTransport {
  protected override awaitsPeer = true

  constructor(config: RelayConfig, options: TransportOptions) {
    super(
      `${config.relayUrl.replace(/\/$/, '')}/?room=${encodeURIComponent(config.room)}&role=device`,
      config.key,
      options,
    )
  }
}
