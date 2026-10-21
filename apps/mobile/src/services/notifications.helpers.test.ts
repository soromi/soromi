import { expect, test } from 'vitest'

import {
  getBannerId,
  toAnswer,
  toAnswered,
  toData,
  toResponseTarget,
  toTarget,
} from './notifications.helpers'

const banner = { title: 'Soromi', body: '"kazomi" finished' }

test('a banner about a session is posted under that session, and leads back to it', () => {
  const about = { ...banner, session: 's1' }

  expect(getBannerId(about)).toBe('s1')
  expect(toTarget(toData(about))).toEqual({ session: 's1' })
})

test('a banner about no session shares one name, and leads nowhere', () => {
  expect(getBannerId(banner)).toBe('soromi')
  expect(toTarget(toData(banner))).toBeNull()
})

test('anything else that comes with a tapped banner leads nowhere', () => {
  expect(toTarget(undefined)).toBeNull()
  expect(toTarget(null)).toBeNull()
  expect(toTarget('s1')).toBeNull()
  expect(toTarget({ session: 7 })).toBeNull()
  expect(toTarget({ session: '' })).toBeNull()
})

test('a tool request goes along with its banner, and a button press is read as its answer', () => {
  const banner = { title: 'Soromi', body: 'asks', session: 's1', approval: 'r1' }

  expect(toTarget(toData(banner))).toEqual({ session: 's1', approval: 'r1' })
  expect(toTarget({ session: 's1', device: 'd1', approval: 'r1' })).toEqual({
    session: 's1',
    device: 'd1',
    approval: 'r1',
  })
  expect(toAnswer('allow')).toBe('allow')
  expect(toAnswer('deny')).toBe('deny')
  expect(toAnswer('expo.modules.notifications.actions.DEFAULT')).toBeNull()
  expect(toAnswer(undefined)).toBeNull()
})

test("a press of a banner's button is read from the system's account of it, either shape", () => {
  const response = {
    actionIdentifier: 'deny',
    notification: {
      request: {
        identifier: 'push-7',
        content: { data: { session: 's1', device: 'd1', approval: 'r1' } },
      },
    },
  }
  const answered = toAnswered(toResponseTarget(response))
  expect(answered).toEqual({
    session: 's1',
    device: 'd1',
    approval: 'r1',
    answer: 'deny',
    banner: 'push-7',
  })

  // Android's task can bring the data as text.
  const task = {
    actionIdentifier: 'allow',
    notification: {
      request: {
        identifier: 'push-8',
        content: { dataString: JSON.stringify({ session: 's2', approval: 'r2' }) },
      },
    },
  }
  expect(toAnswered(toResponseTarget(task))?.approval).toBe('r2')
})

test('a plain tap, or a button on a banner about no request, is not an answer', () => {
  const tap = {
    actionIdentifier: 'expo.modules.notifications.actions.DEFAULT',
    notification: { request: { identifier: 's1', content: { data: { session: 's1' } } } },
  }
  expect(toResponseTarget(tap)).toEqual({ session: 's1', banner: 's1' })
  expect(toAnswered(toResponseTarget(tap))).toBeNull()
  const noRequest = { ...tap, actionIdentifier: 'allow' }
  expect(toAnswered(toResponseTarget(noRequest))).toBeNull()
  expect(toResponseTarget(null)).toBeNull()
  expect(
    toResponseTarget({ notification: { request: { content: { dataString: '{' } } } }),
  ).toBeNull()
})
