/** The scheme and path of a pairing code; its payload follows in the fragment. */
const PREFIX = 'soromi://pair#'

/** The layout of the payload this build reads. */
const VERSION = 1

/** What a device needs to reach the daemon it was paired with. */
export interface Pairing {
  /** The id the desktop gave this device. */
  device: string
  /** The relay to dial. */
  relay: string
  /** The room on that relay the daemon waits in. */
  room: string
  /** Base64 32-byte secret the link's end-to-end encryption is keyed from. */
  key: string
}

/** Why a scanned or pasted text is not a pairing this build can use. */
export type PairingError =
  /** Not a Soromi pairing code at all. */
  | 'not-a-code'
  /** A pairing code from a newer desktop than this app understands. */
  | 'unsupported-version'

export type ParsedPairing = { ok: true; pairing: Pairing } | { ok: false; error: PairingError }

const decoder = new TextDecoder()

/** Decodes unpadded base64url, or returns `null` if it is not that. */
function fromBase64Url(text: string): Uint8Array | null {
  if (!/^[A-Za-z0-9_-]+$/.test(text)) return null
  try {
    const raw = atob(text.replace(/-/g, '+').replace(/_/g, '/'))
    const bytes = new Uint8Array(raw.length)
    for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i)

    return bytes
  } catch {
    return null
  }
}

/**
 * Reads the code the desktop shows as a QR when pairing a device:
 * `soromi://pair#<base64url(JSON { v, device, relay, room, key })>`.
 */
export function parsePairingCode(code: string): ParsedPairing {
  const text = code.trim()
  if (!text.startsWith(PREFIX)) return { ok: false, error: 'not-a-code' }
  const bytes = fromBase64Url(text.slice(PREFIX.length))
  if (!bytes) return { ok: false, error: 'not-a-code' }

  let payload: unknown
  try {
    payload = JSON.parse(decoder.decode(bytes))
  } catch {
    return { ok: false, error: 'not-a-code' }
  }
  if (typeof payload !== 'object' || payload === null) return { ok: false, error: 'not-a-code' }
  const fields = payload as Record<string, unknown>
  if (typeof fields.v !== 'number') return { ok: false, error: 'not-a-code' }
  if (fields.v !== VERSION) return { ok: false, error: 'unsupported-version' }

  const { device, relay, room, key } = fields
  if (
    typeof device !== 'string' ||
    typeof relay !== 'string' ||
    typeof room !== 'string' ||
    typeof key !== 'string' ||
    !/^wss?:\/\//.test(relay) ||
    room === '' ||
    key === ''
  ) {
    return { ok: false, error: 'not-a-code' }
  }

  return { ok: true, pairing: { device, relay, room, key } }
}
