import { xchacha20poly1305 } from '@noble/ciphers/chacha.js'
import { hkdf } from '@noble/hashes/hkdf.js'
import { sha256 } from '@noble/hashes/sha2.js'

/** The first byte of every frame on an encrypted link. */
const OPEN = 0x01 // device to host: start a session. `[OPEN][version][device random]`
const ACCEPT = 0x02 // host to device: `[ACCEPT][version][device random][host random]`
const DATA = 0x03 // either way: `[DATA][counter, big-endian u64][ciphertext]`

/** The version of the session handshake. */
const VERSION = 1

/** Each side's contribution to a session's keys. */
const RANDOM_LEN = 32

/** XChaCha20-Poly1305 takes a 24-byte nonce: sixteen zero bytes, then the frame's counter. */
const NONCE_LEN = 24

const encoder = new TextEncoder()
const DEVICE_TO_HOST = encoder.encode('soromi relay v1 device to host')
const HOST_TO_DEVICE = encoder.encode('soromi relay v1 host to device')

/** Decodes a standard-base64 32-byte key. */
export function decodeKey(base64: string): Uint8Array {
  const raw = atob(base64.trim())
  const key = new Uint8Array(raw.length)

  for (let i = 0; i < raw.length; i++) {
    key[i] = raw.charCodeAt(i)
  }

  return key
}

export interface SessionKeys {
  deviceToHost: Uint8Array
  hostToDevice: Uint8Array
}

/**
 * Derives a session's two keys from the pairing secret and what each side contributed. Both
 * contributions are fresh for every session, so frames recorded from one session open under no
 * other, and each direction has its own key, so a frame cannot be turned back on its sender.
 */
export function sessionKeys(
  secret: Uint8Array,
  deviceRandom: Uint8Array,
  hostRandom: Uint8Array,
): SessionKeys {
  const salt = new Uint8Array(RANDOM_LEN * 2)
  salt.set(deviceRandom, 0)
  salt.set(hostRandom, RANDOM_LEN)

  return {
    deviceToHost: hkdf(sha256, secret, salt, DEVICE_TO_HOST, 32),
    hostToDevice: hkdf(sha256, secret, salt, HOST_TO_DEVICE, 32),
  }
}

/**
 * Writes a frame counter as a big-endian u64 at `offset`. Counters are plain numbers: exact up to
 * 2^53, far more frames than a session will ever carry, and available on every JavaScript engine
 * (64-bit integer views are not).
 */
function writeCounter(bytes: Uint8Array, offset: number, counter: number): void {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  view.setUint32(offset, Math.floor(counter / 0x1_0000_0000))
  view.setUint32(offset + 4, counter >>> 0)
}

/** Reads the counter `writeCounter` wrote, or `null` if it is beyond what a number holds exactly. */
function readCounter(bytes: Uint8Array, offset: number): number | null {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const high = view.getUint32(offset)
  if (high > 0x1f_ffff) return null

  return high * 0x1_0000_0000 + view.getUint32(offset + 4)
}

function nonce(counter: number): Uint8Array {
  const bytes = new Uint8Array(NONCE_LEN)
  writeCounter(bytes, NONCE_LEN - 8, counter)

  return bytes
}

/** Encrypts a payload into the data frame numbered `counter`. */
export function sealFrame(key: Uint8Array, counter: number, payload: Uint8Array): Uint8Array {
  const ciphertext = xchacha20poly1305(key, nonce(counter)).encrypt(payload)
  const frame = new Uint8Array(9 + ciphertext.length)
  frame[0] = DATA
  writeCounter(frame, 1, counter)
  frame.set(ciphertext, 9)

  return frame
}

/**
 * Decrypts a data frame, or returns `null` if it is not one, fails authentication, or its counter
 * is not past `after`: such a frame was seen before and is being sent again.
 */
export function openFrame(
  key: Uint8Array,
  after: number,
  frame: Uint8Array,
): { counter: number; payload: Uint8Array } | null {
  if (frame.length < 9 || frame[0] !== DATA) return null
  const counter = readCounter(frame, 1)
  if (counter === null || counter <= after) return null

  try {
    return { counter, payload: xchacha20poly1305(key, nonce(counter)).decrypt(frame.subarray(9)) }
  } catch {
    return null
  }
}

/** What an inbound frame turned out to be. */
export type Received = { kind: 'accepted' } | { kind: 'payload'; payload: Uint8Array } | null

/**
 * The device's end of an encrypted relay link. The pairing secret never encrypts anything itself:
 * the device asks the host for a session, each side contributes randomness, and the session's keys
 * are derived from all three. Until the host accepts, nothing can be sent or read.
 */
export class DeviceLink {
  /** What this device contributed to the session it asked for and has not had accepted yet. */
  private pending: Uint8Array | null = null
  private keys: SessionKeys | null = null
  /** The last counter used for sending, and the highest one accepted. */
  private sent = 0
  private seen = 0

  constructor(private readonly secret: Uint8Array) {}

  /** Asks the host for a session, dropping the current one. Returns the frame to send. */
  open(): Uint8Array {
    this.end()
    this.pending = crypto.getRandomValues(new Uint8Array(RANDOM_LEN))

    const frame = new Uint8Array(2 + RANDOM_LEN)
    frame[0] = OPEN
    frame[1] = VERSION
    frame.set(this.pending, 2)

    return frame
  }

  /** Reads an inbound frame: the host's reply to `open`, or a data frame of the session. */
  receive(frame: Uint8Array): Received {
    if (frame[0] === ACCEPT) return this.accepted(frame) ? { kind: 'accepted' } : null
    if (!this.keys) return null

    const opened = openFrame(this.keys.hostToDevice, this.seen, frame)
    if (!opened) return null
    this.seen = opened.counter

    return { kind: 'payload', payload: opened.payload }
  }

  /** Encrypts a payload for the host, or returns `null` while no session is on. */
  seal(payload: Uint8Array): Uint8Array | null {
    if (!this.keys) return null
    this.sent += 1

    return sealFrame(this.keys.deviceToHost, this.sent, payload)
  }

  /** Ends the session: the host left. Nothing can be sent or read until a new one is on. */
  end(): void {
    this.pending = null
    this.keys = null
    this.sent = 0
    this.seen = 0
  }

  /**
   * Takes the host's reply and turns the session on. The reply names the request it answers; one
   * for anything but the request still waiting is ignored.
   */
  private accepted(frame: Uint8Array): boolean {
    if (!this.pending || frame.length !== 2 + RANDOM_LEN * 2 || frame[1] !== VERSION) return false
    const deviceRandom = frame.subarray(2, 2 + RANDOM_LEN)
    if (!deviceRandom.every((byte, index) => byte === this.pending?.[index])) return false

    this.keys = sessionKeys(this.secret, this.pending, frame.subarray(2 + RANDOM_LEN))
    this.pending = null

    return true
  }
}
