import { expect, test } from 'vitest'

import { DeviceLink, decodeKey, openFrame, sealFrame, sessionKeys } from './relay-crypto'

/** A base64 32-byte key (all 0x01), just for tests. */
const KEY = 'AQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQE='
const OTHER = 'AgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgI='

const encoder = new TextEncoder()
const decoder = new TextDecoder()
const hex = (bytes: Uint8Array) =>
  Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('')

/** Plays the host: answers a device's request and returns the reply with the session's keys. */
function accept(secret: Uint8Array, open: Uint8Array) {
  const deviceRandom = open.subarray(2)
  const hostRandom = crypto.getRandomValues(new Uint8Array(32))
  const reply = new Uint8Array(66)
  reply[0] = 0x02
  reply[1] = 1
  reply.set(deviceRandom, 2)
  reply.set(hostRandom, 34)

  return { reply, keys: sessionKeys(secret, deviceRandom, hostRandom) }
}

/** A device with a session on, and the keys its host holds. */
function session(hostKey = KEY, deviceKey = KEY) {
  const device = new DeviceLink(decodeKey(deviceKey))
  const { reply, keys } = accept(decodeKey(hostKey), device.open())
  expect(device.receive(reply)).toEqual({ kind: 'accepted' })

  return { device, keys }
}

test('payloads cross a session both ways', () => {
  const { device, keys } = session()

  const up = device.seal(encoder.encode('{"type":"list-workspaces"}')) as Uint8Array
  const opened = openFrame(keys.deviceToHost, 0, up)
  expect(decoder.decode(opened?.payload)).toBe('{"type":"list-workspaces"}')

  const down = sealFrame(keys.hostToDevice, 1, encoder.encode('{"type":"up-to-date"}'))
  const received = device.receive(down)
  expect(received?.kind).toBe('payload')
  expect(decoder.decode((received as { payload: Uint8Array }).payload)).toBe(
    '{"type":"up-to-date"}',
  )
})

test('nothing is sent or read without a session', () => {
  const device = new DeviceLink(decodeKey(KEY))
  expect(device.seal(encoder.encode('x'))).toBeNull()

  const { device: live, keys } = session()
  live.end()
  expect(live.seal(encoder.encode('x'))).toBeNull()
  expect(live.receive(sealFrame(keys.hostToDevice, 1, encoder.encode('x')))).toBeNull()
})

test('a different secret cannot read the session', () => {
  const { device, keys } = session(KEY, OTHER)

  expect(device.receive(sealFrame(keys.hostToDevice, 1, encoder.encode('secret')))).toBeNull()
  expect(openFrame(keys.deviceToHost, 0, device.seal(encoder.encode('x')) as Uint8Array)).toBeNull()
})

test('a frame sent again is refused', () => {
  const { device, keys } = session()
  const first = sealFrame(keys.hostToDevice, 1, encoder.encode('one'))
  const second = sealFrame(keys.hostToDevice, 2, encoder.encode('two'))

  expect(device.receive(first)?.kind).toBe('payload')
  expect(device.receive(first)).toBeNull()
  expect(device.receive(second)?.kind).toBe('payload')
  expect(device.receive(second)).toBeNull()
  expect(device.receive(first)).toBeNull()
})

test('a frame cannot be turned back on its sender', () => {
  const { device } = session()

  expect(device.receive(device.seal(encoder.encode('x')) as Uint8Array)).toBeNull()
})

test('a reply to another request is ignored', () => {
  const secret = decodeKey(KEY)
  const device = new DeviceLink(secret)

  // The device asks twice; the answer to the first request arrives after the second.
  const stale = accept(secret, device.open())
  const current = accept(secret, device.open())

  expect(device.receive(stale.reply)).toBeNull()
  expect(device.receive(current.reply)).toEqual({ kind: 'accepted' })
  // An accepted reply is not taken a second time.
  expect(device.receive(current.reply)).toBeNull()

  const frame = device.seal(encoder.encode('x')) as Uint8Array
  expect(openFrame(current.keys.deviceToHost, 0, frame)).not.toBeNull()
  expect(openFrame(stale.keys.deviceToHost, 0, frame)).toBeNull()
})

test('a new session starts its counters over with other keys', () => {
  const secret = decodeKey(KEY)
  const device = new DeviceLink(secret)
  const first = accept(secret, device.open())
  device.receive(first.reply)
  device.seal(encoder.encode('x'))
  const recorded = sealFrame(first.keys.hostToDevice, 1, encoder.encode('old'))

  const second = accept(secret, device.open())
  device.receive(second.reply)

  expect(device.receive(recorded)).toBeNull()
  const frame = device.seal(encoder.encode('x')) as Uint8Array
  expect(openFrame(second.keys.deviceToHost, 0, frame)?.counter).toBe(1)
})

test('counters past 32 bits are written and read back whole', () => {
  const key = new Uint8Array(32).fill(7)
  const counter = 2 ** 40 + 5
  const frame = sealFrame(key, counter, encoder.encode('x'))

  expect(hex(frame.subarray(1, 9))).toBe('0000010000000005')
  expect(openFrame(key, counter - 1, frame)?.counter).toBe(counter)
  expect(openFrame(key, counter, frame)).toBeNull()
})

// Fixed inputs and what they must produce. The daemon's test holds the same values, so the two
// implementations cannot drift apart unnoticed.
test('keys and frames match the shared vector', () => {
  const keys = sessionKeys(
    new Uint8Array(32).fill(1),
    new Uint8Array(32).fill(2),
    new Uint8Array(32).fill(3),
  )
  expect(hex(keys.deviceToHost)).toBe(
    '00ba1df2d8a13f87172100cef8c48be88465ec84594a5f01ae0303b66954281f',
  )
  expect(hex(keys.hostToDevice)).toBe(
    '022b03f0121374d4ad7e5a4366c942d6b7465c053b2d9804b2ed1f4b865f3bdb',
  )
  expect(hex(sealFrame(keys.deviceToHost, 1, encoder.encode('{"type":"ping","nonce":1}')))).toBe(
    '030000000000000001c51c73157a6b2e8a9338a5a1b551f0b87e1f4f44d582079bb0b05c64629d77564f20fef250171fba05',
  )
})
