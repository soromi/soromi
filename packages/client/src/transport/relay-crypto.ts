import { xchacha20poly1305 } from '@noble/ciphers/chacha.js'

/** XChaCha20-Poly1305 nonce length; prepended to each ciphertext frame. */
const NONCE_LEN = 24

/** Decodes a standard-base64 32-byte key. */
export function decodeKey(base64: string): Uint8Array {
  const raw = atob(base64.trim())
  const key = new Uint8Array(raw.length)

  for (let i = 0; i < raw.length; i++) {
    key[i] = raw.charCodeAt(i)
  }

  return key
}

/** Encrypts plaintext into a `nonce || ciphertext` frame. */
export function seal(key: Uint8Array, plaintext: Uint8Array): ArrayBufferLike {
  const nonce = crypto.getRandomValues(new Uint8Array(NONCE_LEN))
  const ciphertext = xchacha20poly1305(key, nonce).encrypt(plaintext)

  const frame = new Uint8Array(NONCE_LEN + ciphertext.length)
  frame.set(nonce, 0)
  frame.set(ciphertext, NONCE_LEN)

  return frame.buffer
}

/** Decrypts a `nonce || ciphertext` frame, or null if it is malformed or fails authentication. */
export function open(key: Uint8Array, frame: ArrayBuffer): Uint8Array | null {
  const bytes = new Uint8Array(frame)
  if (bytes.length < NONCE_LEN) return null

  const nonce = bytes.subarray(0, NONCE_LEN)
  const ciphertext = bytes.subarray(NONCE_LEN)

  try {
    return xchacha20poly1305(key, nonce).decrypt(ciphertext)
  } catch {
    return null
  }
}
