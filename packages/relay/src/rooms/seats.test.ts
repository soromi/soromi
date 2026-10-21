import { expect, test } from 'vitest'

import { ROLES, other, presenceFrame } from './seats'

test('a frame goes to the other side of the room', () => {
  expect(other('host')).toBe('device')
  expect(other('device')).toBe('host')
  expect(ROLES).toEqual(['host', 'device'])
})

test('presence is said as the daemon and the phone read it', () => {
  expect(JSON.parse(presenceFrame(2))).toEqual({ __relay: 'presence', peers: 2 })
})
