import { expect, test } from 'vitest'

import { appendEvents, deferredFiles, withFile } from './chat-log'

//Types
import type { ChatEvent, ChatFile } from '@soromi/protocol'
import type { ChatLog } from './chat-log'

const says = (text: string): ChatEvent => ({ kind: 'assistant', text })
const texts = (events: ChatEvent[]) => events.map((event) => ('text' in event ? event.text : ''))

const stub: ChatFile = { mediaType: 'image/png', data: '', deferred: true }
const image: ChatFile = { mediaType: 'image/png', data: 'aGk=' }
const shows = (text: string, files: ChatFile[]): ChatEvent => ({ kind: 'user', text, files })

/** A log holding events 4, 5 and 6 of run `a`. */
const held: ChatLog = { events: [says('4'), says('5'), says('6')], cursor: { log: 'a', seq: 6 } }

test('new events go on the end and move the cursor', () => {
  const next = appendEvents(held, [says('7'), says('8')], 8)

  expect(texts(next.events)).toEqual(['4', '5', '6', '7', '8'])
  expect(next.cursor).toEqual({ log: 'a', seq: 8 })
})

test('events already held are not added twice', () => {
  // Wholly old: nothing changes.
  expect(appendEvents(held, [says('6')], 6)).toBe(held)
  // Overlapping: only the part past the cursor is taken.
  const next = appendEvents(held, [says('5'), says('6'), says('7')], 7)

  expect(texts(next.events)).toEqual(['4', '5', '6', '7'])
  expect(next.cursor?.seq).toBe(7)
})

test('events are ignored until a reset has said where the log stands', () => {
  const empty: ChatLog = { events: [] }

  expect(appendEvents(empty, [says('1')], 1)).toBe(empty)
})

test('files waiting for their bytes are found by the place of their event', () => {
  const log: ChatLog = {
    // An earlier page was loaded in front, so the array starts before the first live event.
    events: [shows('a', [stub]), says('b'), shows('c', [image, stub])],
    cursor: { log: 'a', seq: 10 },
  }

  expect(deferredFiles(log)).toEqual([
    { seq: 8, index: 0 },
    { seq: 10, index: 1 },
  ])
  expect(deferredFiles({ events: log.events })).toEqual([])
})

test('a fetched file takes the place of its stub', () => {
  const log: ChatLog = {
    events: [shows('a', [stub]), says('b'), shows('c', [stub, stub])],
    cursor: { log: 'a', seq: 10 },
  }

  const events = withFile(log, 'a', 10, 1, image)
  expect(events[2]).toEqual(shows('c', [stub, image]))
  expect(events[0]).toBe(log.events[0])
  expect(deferredFiles({ events, cursor: log.cursor })).toEqual([
    { seq: 8, index: 0 },
    { seq: 10, index: 0 },
  ])
})

test('a picture a tool returned is fetched and put in place like an attachment', () => {
  const returned: ChatEvent = { kind: 'tool-result', id: 't1', ok: true, text: '', files: [stub] }
  const log: ChatLog = { events: [says('a'), returned], cursor: { log: 'a', seq: 5 } }

  expect(deferredFiles(log)).toEqual([{ seq: 5, index: 0 }])
  const events = withFile(log, 'a', 5, 0, image)
  expect(events[1]).toEqual({ ...returned, files: [image] })
})

test('a file for another run of the log, or an event not held, changes nothing', () => {
  const log: ChatLog = { events: [shows('a', [stub]), says('b')], cursor: { log: 'a', seq: 5 } }

  expect(withFile(log, 'earlier', 4, 0, image)).toBe(log.events)
  expect(withFile(log, 'a', 3, 0, image)).toBe(log.events)
  expect(withFile(log, 'a', 6, 0, image)).toBe(log.events)
  expect(withFile(log, 'a', 5, 0, image)).toBe(log.events)
  expect(withFile(log, 'a', 4, 1, image)).toBe(log.events)
})
