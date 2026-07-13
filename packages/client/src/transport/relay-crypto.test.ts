import { expect, test } from 'vitest'

import { decodeKey, open, seal } from './relay-crypto'

/** A base64 32-byte key (all 0x01), just for tests. */
const KEY = 'AQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQE='
const OTHER = 'AgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgI='

test('seals and opens a round trip', () => {
  const key = decodeKey(KEY)
  const message = new TextEncoder().encode('{"type":"list-workspaces"}')

  const frame = seal(key, message)
  const opened = open(key, frame as ArrayBuffer)

  expect(opened).not.toBeNull()
  expect(new TextDecoder().decode(opened as Uint8Array)).toBe('{"type":"list-workspaces"}')
})

test('a different key cannot open the frame', () => {
  const frame = seal(decodeKey(KEY), new TextEncoder().encode('secret'))

  expect(open(decodeKey(OTHER), frame as ArrayBuffer)).toBeNull()
})

test('uses a random nonce, so two seals of the same plaintext differ', () => {
  const key = decodeKey(KEY)
  const plaintext = new TextEncoder().encode('same')

  const a = new Uint8Array(seal(key, plaintext) as ArrayBuffer)
  const b = new Uint8Array(seal(key, plaintext) as ArrayBuffer)

  expect(a).not.toEqual(b)
})

test('rejects a frame shorter than the nonce', () => {
  expect(open(decodeKey(KEY), new Uint8Array(8).buffer)).toBeNull()
})
