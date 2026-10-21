import { TERMINAL_OUTPUT } from '@soromi/protocol'

//Types
import type { ServerMessage } from '@soromi/protocol'

/** What a received payload turned out to be: a protocol message, or output for one terminal. */
export type Decoded =
  | { kind: 'message'; message: ServerMessage }
  | { kind: 'output'; session: string; data: string }

const decoder = new TextDecoder()

/**
 * Reads a received payload. JSON arrives as a string (plaintext link) or as bytes starting with `{`
 * (decrypted link) and is a protocol message. Anything starting with the terminal opcode is a
 * binary terminal frame, `[opcode][slot, big-endian u16][utf-8 output]`: output for the session
 * that slot was assigned to. Returns `null` for anything unreadable, including a terminal frame for
 * a slot this connection was never told about.
 */
export function decodePayload(
  payload: string | Uint8Array,
  slots: ReadonlyMap<number, string>,
): Decoded | null {
  if (typeof payload !== 'string' && payload[0] === TERMINAL_OUTPUT) {
    if (payload.length < 3) return null
    const session = slots.get((payload[1] << 8) | payload[2])
    if (session === undefined) return null

    return { kind: 'output', session, data: decoder.decode(payload.subarray(3)) }
  }

  try {
    const text = typeof payload === 'string' ? payload : decoder.decode(payload)

    return { kind: 'message', message: JSON.parse(text) as ServerMessage }
  } catch {
    return null
  }
}
