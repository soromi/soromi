import { expect, test } from 'vitest'

import { getCaption, getConversationKey, getEmptyText } from './helpers'

const conversation = {
  id: 'c1',
  agent: 'claude',
  account: 'work',
  title: 'Fix the login bug',
  updated: 0,
}

test('a conversation is told apart by its account as well as its id', () => {
  expect(getConversationKey(conversation)).toBe('work:c1')
})

test('the caption says what picking one does, or what a search found', () => {
  expect(getCaption(null, 12)).toMatch(/new session/)
  expect(getCaption('login', 1)).toBe('1 conversation mentions “login”')
  expect(getCaption('login', 3)).toBe('3 mention “login”')
  expect(getCaption('login', 50)).toBe('The 50 newest that mention “login”')
  expect(getCaption('login', 0)).toBe('')
})

test('an empty list says whether nothing is there, or nothing mentions the search', () => {
  expect(getEmptyText(null)).toBe('No earlier conversations in this workspace yet.')
  expect(getEmptyText('stripe')).toBe('No conversation here mentions “stripe”.')
})
