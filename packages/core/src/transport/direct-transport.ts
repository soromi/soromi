import { SecureTransport } from './secure-transport'

//Types
import type { TransportOptions } from './web-socket-transport'

export interface DirectConfig {
  /** Where the daemon listens for its devices, as it reported it: `ws://192.168.1.20:8318`. */
  route: string
  /** The id the desktop gave this device, which says whose key the link is sealed with. */
  device: string
  /** Base64 32-byte end-to-end key (from pairing). A direct link is never plaintext. */
  key: string
}

/**
 * Transport straight to the daemon, over a network the phone shares with the computer: dials
 * `<route>/?device=<id>` and speaks the relay link's encrypted frames, with no relay in between.
 *
 * It is one attempt: the address is only good while both are on that network, so when the socket
 * drops it stays down, and whoever chose this route decides what to try next.
 */
export class DirectTransport extends SecureTransport {
  constructor(config: DirectConfig, options: TransportOptions) {
    super(
      `${config.route.replace(/\/$/, '')}/?device=${encodeURIComponent(config.device)}`,
      config.key,
      { ...options, reconnect: false },
    )
  }
}
