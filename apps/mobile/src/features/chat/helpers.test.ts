import { expect, test } from 'vitest'

import {
  findModel,
  fitAttachments,
  getAgentElapsed,
  getAgentsLabel,
  getContextMessage,
  getElapsedSeconds,
  getFetchKey,
  getImageUri,
  isImage,
  clip,
  getDiffText,
  getEncodedSize,
  getMoreLabel,
  getNoticeText,
  getQueueLabel,
  getRowKey,
  getSwitchMessage,
  getWorkingMeta,
  hasMessage,
  toModelKey,
  toRows,
} from './helpers'

//Type
import type { ProviderModels } from '@soromi/core'
import type { ChatEvent } from '@soromi/protocol'
import type { Attachment } from '@/states/chat/chat.state.type'

const says = (text: string): ChatEvent => ({ kind: 'assistant', text })

test('the conversation is listed newest first, with the streaming reply as the newest', () => {
  const rows = toRows([says('one'), says('two')], 'three so far')

  expect(rows.map((row) => (row.kind === 'assistant' ? row.text : ''))).toEqual([
    'three so far',
    'two',
    'one',
  ])
  expect(toRows(undefined, '')).toEqual([])
})

test('a settled message keeps its key when more arrive, so its row is not redrawn', () => {
  const first = says('one')
  const before = toRows([first], '')
  const after = toRows([first, says('two')], 'three')

  expect(after.at(-1)?.key).toBe(before[0].key)
  expect(getRowKey(after[0])).toBe('streaming')
})

test('tool calls come with their results, and a long run of them as one group', () => {
  const call = (id: string): ChatEvent => ({
    kind: 'tool',
    id,
    name: 'Bash',
    toolKind: 'run',
    body: 'ls',
  })
  const rows = toRows(
    [call('a'), { kind: 'tool-result', id: 'a', ok: true, text: 'out' }, call('b'), call('c')],
    '',
  )

  expect(rows.map((row) => row.kind)).toEqual(['tool-group'])
})

test('a long body is cut, and says how much was left out', () => {
  expect(clip([1, 2, 3], 5)).toEqual({ shown: [1, 2, 3], hidden: 0 })
  expect(clip([1, 2, 3], 2)).toEqual({ shown: [1, 2], hidden: 1 })
  expect(getMoreLabel(12)).toBe('+ 12 more lines')
  expect(getDiffText({ sign: '+', text: 'new' })).toBe('+ new')
  expect(getDiffText({ sign: '-', text: 'old' })).toBe('− old')
  expect(getDiffText({ sign: ' ', text: 'same' })).toBe('  same')
})

test('the working line gives the time, and the tokens once they are known', () => {
  expect(getWorkingMeta(6, null)).toBe(' · 6s')
  expect(getWorkingMeta(6, 0)).toBe(' · 6s')
  expect(getWorkingMeta(415, 519_100)).toBe(' · 6m 55s · ↓ 519.1k tokens')
})

test('elapsed time is whole seconds and never negative', () => {
  expect(getElapsedSeconds(1000, 7999)).toBe(6)
  expect(getElapsedSeconds(5000, 1000)).toBe(0)
})

test('notices lose their brackets, and an empty one reads as an interruption', () => {
  expect(getNoticeText('[Request interrupted by user]')).toBe('Request interrupted by user')
  expect(getNoticeText('')).toBe('Interrupted')
})

test('queued messages say when they go, or that a stop holds them', () => {
  expect(getQueueLabel(1, false)).toBe('Queued: sent when the agent finishes.')
  expect(getQueueLabel(3, false)).toBe('3 queued: sent one at a time as the agent finishes.')
  expect(getQueueLabel(3, true)).toMatch(/held after Stop/)
})

test('agents in the background are counted, and timed like a stopwatch', () => {
  expect(getAgentsLabel(1)).toBe('1 agent working in the background')
  expect(getAgentsLabel(3)).toBe('3 agents working in the background')
  expect(getAgentElapsed(100, 148)).toBe('48s')
  expect(getAgentElapsed(100, 172)).toBe('1m 12s')
  // A clock a little behind the computer's does not count backwards.
  expect(getAgentElapsed(100, 90)).toBe('0s')
})

test('the context warning says how full the window is', () => {
  expect(getContextMessage(84)).toContain('Context is 84% full')
})

test('a picture is drawn from its bytes once they are here', () => {
  const pending = { mediaType: 'image/png', data: '', deferred: true }
  const arrived = { mediaType: 'image/png', data: 'AAAA' }

  expect(isImage(pending)).toBe(true)
  expect(isImage({ mediaType: 'application/pdf', data: 'AAAA' })).toBe(false)
  expect(getImageUri(pending)).toBeNull()
  expect(getImageUri(arrived)).toBe('data:image/png;base64,AAAA')
  expect(getFetchKey('log1', 7, 0)).toBe('log1:7:0')
})

const picture = (uri: string, size: number): Attachment => ({
  uri,
  file: { mediaType: 'image/jpeg', data: 'x'.repeat(size) },
})

test('a message is something written, or a picture on its own', () => {
  expect(hasMessage('  ', 0)).toBe(false)
  expect(hasMessage(' hi ', 0)).toBe(true)
  expect(hasMessage('', 1)).toBe(true)
})

test('pictures join a message while their count and their size together allow', () => {
  const limit = { limit: 3, maxEncoded: 100 }
  const held = [picture('a', 40)]

  // The second is too large beside what is held; the third still fits.
  const fit = fitAttachments(held, [picture('b', 30), picture('c', 50), picture('d', 30)], limit)
  expect(fit.accepted.map((one) => one.uri)).toEqual(['b', 'd'])
  expect(fit.dropped).toBe(1)
  expect(getEncodedSize([...held, ...fit.accepted])).toBe(100)

  // No more than the count, however small they are.
  const many = fitAttachments(held, [picture('b', 1), picture('c', 1), picture('d', 1)], limit)
  expect(many.accepted).toHaveLength(2)
  expect(many.dropped).toBe(1)
})

test('the default model has a key of its own, and is found by it', () => {
  const models: ProviderModels = {
    models: [
      { value: null, label: 'Default', description: '', effort: true, contextLimit: 1 },
      { value: 'big', label: 'Big', description: '', effort: false, contextLimit: 1 },
    ],
    effortLevels: [],
    effortLabels: {},
    defaultEffort: '',
  }

  expect(findModel(models, toModelKey(null))?.label).toBe('Default')
  expect(findModel(models, toModelKey('big'))?.label).toBe('Big')
  expect(findModel(models, 'gone')).toBeUndefined()
})

test('switching agent says which one, and that the conversation starts over', () => {
  const message = getSwitchMessage({ agent: 'codex', accountLabel: 'work', label: 'Codex' })

  expect(message).toContain('Codex (work)')
  expect(message).toContain('new conversation')
})
