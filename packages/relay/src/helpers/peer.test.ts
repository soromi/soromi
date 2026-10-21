import { expect, test } from 'vitest'

import { holdsKey, mayOpen, roleOf, roomOf } from './peer'

test('a room is named by an id of a sensible length', () => {
  expect(roomOf('a1b2c3')).toBe('a1b2c3')
  expect(roomOf(null)).toBeNull()
  expect(roomOf('')).toBeNull()
  expect(roomOf('x'.repeat(129))).toBeNull()
})

test('a host opens a room with the key, or on an open relay; with no key set, never', () => {
  expect(mayOpen('secret', 'secret')).toBe(true)
  expect(mayOpen('secret', 'guess')).toBe(false)
  expect(mayOpen('secret', null)).toBe(false)
  expect(mayOpen('', null)).toBe(true)
  expect(mayOpen(undefined, null)).toBe(false)
  expect(mayOpen(undefined, '')).toBe(false)
})

test('nobody holds a key that is empty or not set', () => {
  expect(holdsKey('secret', 'secret')).toBe(true)
  expect(holdsKey('', '')).toBe(false)
  expect(holdsKey(undefined, null)).toBe(false)
})

test('a peer that names no role is placed by whether it holds the key', () => {
  expect(roleOf('host', false)).toBe('host')
  expect(roleOf('device', true)).toBe('device')
  expect(roleOf(null, true)).toBe('host')
  expect(roleOf('other', false)).toBe('device')
})
