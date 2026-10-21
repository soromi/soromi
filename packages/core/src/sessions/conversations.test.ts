import { expect, test } from 'vitest'

import { conversationAge, conversationQuery, isStaleList } from './conversations'

const now = Date.UTC(2026, 9, 19, 12) / 1000

test('a conversation says how long ago it was last added to', () => {
  expect(conversationAge(now - 20, now)).toBe('just now')
  expect(conversationAge(now - 5 * 60, now)).toBe('5m ago')
  expect(conversationAge(now - 3 * 3600, now)).toBe('3h ago')
  expect(conversationAge(now - 30 * 3600, now)).toBe('yesterday')
  expect(conversationAge(now - 4 * 86_400, now)).toBe('4d ago')
  // A clock a little behind the computer's does not say "in the future".
  expect(conversationAge(now + 30, now)).toBe('just now')
})

test('an older one says its date, with the year when it is not this one', () => {
  expect(conversationAge(Date.UTC(2026, 2, 3, 12) / 1000, now)).toBe('Mar 3')
  expect(conversationAge(Date.UTC(2025, 2, 3, 12) / 1000, now)).toBe('Mar 3, 2025')
})

test('a search with nothing in it asks for the whole list, and an older answer is stale', () => {
  expect(conversationQuery('  ')).toBeNull()
  expect(conversationQuery(' login ')).toBe('login')
  expect(isStaleList(undefined, null)).toBe(true)
  expect(isStaleList({ query: 'log' }, 'login')).toBe(true)
  expect(isStaleList({ query: 'login' }, 'login')).toBe(false)
})
