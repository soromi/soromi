//Packages
import { RelayTransport } from '@soromi/client'

//Mock
import { MockTransport } from '@/mock/mock-transport'

//Types
import type { RelayConfig, Transport } from '@soromi/client'

/**
 * Parses a pasted pairing artifact into a relay config. Accepts the full pairing URL the desktop
 * shows (`https://web/?relay=..&room=..&key=..`) or just its query string. Returns `null` when it
 * lacks the relay + room a connection needs.
 */
export function parsePairingLink(input: string): RelayConfig | null {
  const text = input.trim()
  if (!text) return null

  const query = text.includes('?') ? text.slice(text.indexOf('?') + 1) : text
  const params = new URLSearchParams(query)

  const relayUrl = params.get('relay')
  const room = params.get('room')
  const key = params.get('key')
  if (!relayUrl || !room) return null

  return { relayUrl, room, key: key ?? undefined }
}

/** The pairing URL to navigate to for a relay config, so `selectTransport` picks it up on load. */
export function pairingUrl(config: RelayConfig): string {
  const params = new URLSearchParams({ relay: config.relayUrl, room: config.room })
  if (config.key) params.set('key', config.key)

  return `${window.location.origin}${window.location.pathname}?${params.toString()}`
}

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
