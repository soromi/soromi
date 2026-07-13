//Packages
import { RelayTransport } from '@soromi/client'

//Mock
import { MockTransport } from '@/mock/mock-transport'

//Types
import type { Transport } from '@soromi/client'

/**
 * Chooses the transport. With `?relay=<url>&room=<id>` in the URL it dials the relay (for testing
 * the real remote path); otherwise it uses the canned mock so the UI runs standalone. When pairing
 * lands, the relay config comes from the paired device instead of the URL.
 */
export function selectTransport(): { transport: Transport; remote: boolean } {
  const params = new URLSearchParams(window.location.search)
  const relayUrl = params.get('relay')
  const room = params.get('room')
  const key = params.get('key')

  if (relayUrl && room) {
    return {
      transport: new RelayTransport({ relayUrl, room, key: key ?? undefined }),
      remote: true,
    }
  }

  return { transport: new MockTransport(), remote: false }
}
