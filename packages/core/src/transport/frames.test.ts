import { expect, test } from 'vitest'

import { TERMINAL_OUTPUT } from '@soromi/protocol'

import { decodePayload } from './frames'

const encoder = new TextEncoder()

/** A binary terminal frame: opcode, slot (big-endian), then the output bytes. */
function terminalFrame(slot: number, text: string): Uint8Array {
  const body = encoder.encode(text)
  const frame = new Uint8Array(3 + body.length)
  frame[0] = TERMINAL_OUTPUT
  frame[1] = slot >> 8
  frame[2] = slot & 0xff
  frame.set(body, 3)

  return frame
}

test('a terminal frame is output for the session its slot was assigned to', () => {
  const slots = new Map([[258, 'session-a']])

  expect(decodePayload(terminalFrame(258, 'héllo \u001b[1m'), slots)).toEqual({
    kind: 'output',
    session: 'session-a',
    data: 'héllo \u001b[1m',
  })
})

test('a terminal frame for an unknown slot is dropped', () => {
  expect(decodePayload(terminalFrame(7, 'x'), new Map())).toBeNull()
})

test('json is read from text and from decrypted bytes alike', () => {
  const json = '{"type":"pong","nonce":3}'
  const expected = { kind: 'message', message: { type: 'pong', nonce: 3 } }

  expect(decodePayload(json, new Map())).toEqual(expected)
  expect(decodePayload(encoder.encode(json), new Map())).toEqual(expected)
})

test('an unreadable payload is dropped', () => {
  expect(decodePayload('not json', new Map())).toBeNull()
  expect(decodePayload(new Uint8Array([TERMINAL_OUTPUT]), new Map())).toBeNull()
})
