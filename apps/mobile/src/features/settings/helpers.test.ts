import { expect, test } from 'vitest'

import { formatDuration, getHostDetail, getLatencySummary, getRelayDraft } from './helpers'

test('the computer is described by its system and what runs Soromi there', () => {
  expect(getHostDetail({ name: 'Mac', os: 'macos', launcher: 'desktop' })).toBe(
    'macOS · Soromi desktop app',
  )
  expect(getHostDetail({ name: 'box', os: 'linux', launcher: 'service' })).toBe(
    'Linux · Running as a service',
  )
  // A system this build has no name for is shown as the daemon gave it.
  expect(getHostDetail({ name: 'box', os: 'freebsd', launcher: 'cli' })).toBe(
    'freebsd · Started from a terminal',
  )
})

test('the link is graded on its average round trip, not on one slow answer', () => {
  expect(getLatencySummary([])).toBeNull()
  expect(getLatencySummary([40, 60, 500])).toEqual({ last: 500, average: 200, grade: 'fair' })
  expect(getLatencySummary([80])?.grade).toBe('good')
  expect(getLatencySummary([900, 700])?.grade).toBe('poor')
})

test('how long the link has been up reads at a glance', () => {
  expect(formatDuration(42_000)).toBe('42 s')
  expect(formatDuration(12 * 60_000 + 5000)).toBe('12 min')
  expect(formatDuration(3 * 3_600_000 + 5 * 60_000)).toBe('3 h 5 min')
  expect(formatDuration(2 * 3_600_000)).toBe('2 h')
  expect(formatDuration(-5)).toBe('0 s')
})

test('a relay address is ws:// or wss:// and a host, kept without a trailing slash', () => {
  expect(getRelayDraft(' wss://relay-worker.soromi.dev/ ', 'wss://relay.soromi.dev')).toEqual({
    url: 'wss://relay-worker.soromi.dev',
    changed: true,
  })
  expect(getRelayDraft('ws://192.168.1.20:8787', undefined).url).toBe('ws://192.168.1.20:8787')
  // As the computer takes them: a bare host is wss://, a web address its WebSocket one.
  expect(getRelayDraft('relay-worker.soromi.dev', undefined).url).toBe(
    'wss://relay-worker.soromi.dev',
  )
  expect(getRelayDraft('https://relay.example.com', undefined).url).toBe('wss://relay.example.com')
  expect(getRelayDraft('ftp://relay.example.com', undefined).url).toBeNull()
  expect(getRelayDraft('wss://relay example.com', undefined).url).toBeNull()
  expect(getRelayDraft('', undefined)).toEqual({ url: null, changed: false })
})

test('the relay in use is not a change', () => {
  expect(getRelayDraft('wss://relay.soromi.dev', 'wss://relay.soromi.dev').changed).toBe(false)
})
