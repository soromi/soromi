import { expect, test } from 'vitest'

import { parsePairingCode } from './pairing-code'

/** A code as the daemon builds it: the payload as unpadded base64url in the fragment. */
function code(payload: unknown): string {
  const base64 = btoa(String.fromCharCode(...new TextEncoder().encode(JSON.stringify(payload))))

  return `soromi://pair#${base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')}`
}

const payload = {
  v: 1,
  device: 'd1',
  relay: 'wss://relay.example/?x=1',
  room: 'room/1',
  key: 'a+b/c=',
}

test('reads the code the desktop shows', () => {
  expect(parsePairingCode(code(payload))).toEqual({
    ok: true,
    pairing: {
      device: 'd1',
      relay: 'wss://relay.example/?x=1',
      room: 'room/1',
      key: 'a+b/c=',
    },
  })
  // As pasted, with stray whitespace around it.
  expect(parsePairingCode(`  ${code(payload)}\n`).ok).toBe(true)
})

test('reads a code the daemon itself produced', () => {
  // The exact text the daemon's test of `pairing_code` pins, so the two cannot drift apart.
  const fromDaemon =
    'soromi://pair#eyJkZXZpY2UiOiJkMSIsImtleSI6ImErYi9jPSIsInJlbGF5Ijoid3NzOi8vcmVsYXkuZXhhbXBsZS8_eD0xIiwicm9vbSI6InJvb20vMSIsInYiOjF9'

  expect(parsePairingCode(fromDaemon)).toEqual(parsePairingCode(code(payload)))
})

test('says when the code is from a newer desktop', () => {
  expect(parsePairingCode(code({ ...payload, v: 2 }))).toEqual({
    ok: false,
    error: 'unsupported-version',
  })
})

test('turns away anything that is not a pairing code', () => {
  const rejected = [
    '',
    'https://example.com',
    'soromi://pair#',
    'soromi://pair#not base64',
    code('just a string'),
    code({ device: 'd1' }),
    code({ ...payload, relay: 'https://not-a-socket.example' }),
    code({ ...payload, key: '' }),
    code({ ...payload, room: 7 }),
  ]
  for (const text of rejected) {
    expect(parsePairingCode(text)).toEqual({ ok: false, error: 'not-a-code' })
  }
})
