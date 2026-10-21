import type { Status, SubAgent } from '@soromi/protocol'
import { expect, test } from 'vitest'

import { runningAgents, sessionStatus } from './status'

const agent = (status: Status): SubAgent => ({ name: 'explore', status, started_at: null })

test('a session whose turn is over still reads as working while its agents run', () => {
  const subagents = [agent('thinking'), agent('done')]

  expect(sessionStatus({ status: 'idle', subagents })).toBe('thinking')
  expect(sessionStatus({ status: 'done', subagents })).toBe('thinking')
  expect(runningAgents({ subagents })).toBe(1)
})

test('agents that have stopped, or none, leave the status as it is', () => {
  expect(sessionStatus({ status: 'done', subagents: [agent('done'), agent('blocked')] })).toBe(
    'done',
  )
  expect(sessionStatus({ status: 'idle', subagents: [] })).toBe('idle')
  expect(sessionStatus({ status: 'idle' })).toBe('idle')
})

test('a session that wants the person keeps saying so, whatever runs behind it', () => {
  const subagents = [agent('thinking')]

  expect(sessionStatus({ status: 'waiting-input', subagents })).toBe('waiting-input')
  expect(sessionStatus({ status: 'blocked', subagents })).toBe('blocked')
})
