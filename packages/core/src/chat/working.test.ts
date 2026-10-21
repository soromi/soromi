import { expect, test } from 'vitest'

import { formatElapsed, formatTokens } from './working'

test('elapsed time is seconds, then minutes and seconds', () => {
  expect(formatElapsed(0)).toBe('0s')
  expect(formatElapsed(59)).toBe('59s')
  expect(formatElapsed(60)).toBe('1m 0s')
  expect(formatElapsed(415)).toBe('6m 55s')
})

test('token counts are abbreviated past a thousand', () => {
  expect(formatTokens(840)).toBe('840')
  expect(formatTokens(6000)).toBe('6.0k')
  expect(formatTokens(519_100)).toBe('519.1k')
  expect(formatTokens(1_200_000)).toBe('1.2M')
})
