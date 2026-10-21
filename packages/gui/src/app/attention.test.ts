import { expect, test } from 'vitest'

import { AWAY_MS, isAttended } from './attention'

test('someone is at the app while its window is in front and in use', () => {
  const now = 10 * AWAY_MS
  expect(isAttended(true, now - 1000, now)).toBe(true)
  // Left in front, untouched: away.
  expect(isAttended(true, now - AWAY_MS, now)).toBe(false)
  // Behind another window: away, however recently it was used.
  expect(isAttended(false, now, now)).toBe(false)
})
