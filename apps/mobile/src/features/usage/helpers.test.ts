import { expect, test } from 'vitest'

import { getLineLabel, getPlanLabel, getResetText } from './helpers'

test('a plan reads as a name', () => {
  expect(getPlanLabel('max')).toBe('Max')
  expect(getPlanLabel('pro')).toBe('Pro')
  expect(getPlanLabel('max_20x')).toBe('Max 20x')
  expect(getPlanLabel('team plan')).toBe('Team Plan')
})

test('a window says when it resets, if the computer said', () => {
  expect(getResetText({ label: '5h', percent: 9, resetsAt: 3 * 3600 + 720 }, 0)).toBe(
    'Resets in 3h 12m',
  )
  expect(getResetText({ label: '5h', percent: 9, resetsAt: 10 }, 20)).toBe('Resets soon')
  expect(getResetText({ label: '5h', percent: 9 }, 0)).toBeNull()
})

test('the usage line says each agent and its percent', () => {
  expect(getLineLabel([{ agent: 'claude', windows: [{ label: '5h', percent: 4 }] }])).toBe(
    'Usage: Claude 4%',
  )
  expect(getLineLabel([{ agent: 'claude', windows: [], note: 'Sign in again' }])).toBe('Usage')
})
