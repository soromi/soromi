import { relayClose } from '@soromi/core'
import { expect, test, vi } from 'vitest'

import {
  confirmSend,
  getStatusAfterClose,
  getStatusFromClose,
  isRelayAddress,
  isRetryable,
} from './link.helpers'

//Type
import type { ClientMessage } from '@soromi/protocol'

test('a drop is read from the code it came with', () => {
  expect(getStatusFromClose(relayClose.noHost)).toBe('computer-offline')
  expect(getStatusFromClose(relayClose.replaced)).toBe('replaced')
  expect(getStatusFromClose(1006)).toBe('connecting')
})

test('a drop that says nothing leaves an unreachable computer unreachable', () => {
  // Every attempt to reach a sleeping computer ends this way; it is not news.
  expect(getStatusAfterClose('computer-offline', 1006)).toBe('computer-offline')
  expect(getStatusAfterClose('computer-offline', 0)).toBe('computer-offline')
  // From anywhere else, it means the link is being brought back.
  expect(getStatusAfterClose('online', 1006)).toBe('connecting')
  // And a drop that does say why is always taken at its word.
  expect(getStatusAfterClose('computer-offline', relayClose.replaced)).toBe('replaced')
  expect(getStatusAfterClose('connecting', relayClose.noHost)).toBe('computer-offline')
})

test('trying again is announced only where the link is down and may come back', () => {
  expect(isRetryable('computer-offline')).toBe(true)
  expect(isRetryable('replaced')).toBe(true)
  expect(isRetryable('online')).toBe(false)
  expect(isRetryable('update-app')).toBe(false)
})

/** A link to send on, which says what was sent and lets the test say when it opens or answers. */
const fakeLink = (open: boolean) => {
  const sent: string[] = []
  const opened = new Set<() => void>()
  const timed = new Set<(ms: number) => void>()
  const link = {
    open,
    send: (message: ClientMessage) => sent.push(message.type),
    measure: () => sent.push('ping'),
    isOpen: () => link.open,
    onOpen: (listener: () => void) => {
      opened.add(listener)
      return () => opened.delete(listener)
    },
    onLatency: (listener: (ms: number) => void) => {
      timed.add(listener)
      return () => timed.delete(listener)
    },
    comesUp: () => {
      link.open = true
      for (const listener of opened) listener()
    },
    answers: () => {
      for (const listener of timed) listener(40)
    },
  }

  return { link, sent, listening: () => opened.size + timed.size }
}

const answer: ClientMessage = {
  type: 'chat-approval-response',
  session: 's1',
  id: 'r1',
  allow: true,
}

test('a message that must not be lost counts as sent once a round trip after it is answered', async () => {
  const { link, sent, listening } = fakeLink(true)
  const result = confirmSend(link, answer, 1000)
  expect(sent).toEqual(['chat-approval-response', 'ping'])
  link.answers()

  await expect(result).resolves.toBe(true)
  expect(listening()).toBe(0)
})

test('on a link still coming up it waits for it, and gives up when nothing answers', async () => {
  vi.useFakeTimers()
  const { link, sent, listening } = fakeLink(false)
  const result = confirmSend(link, answer, 1000)
  // A round trip timed before it was sent says nothing about it.
  link.answers()
  expect(sent).toEqual([])
  link.comesUp()
  expect(sent).toEqual(['chat-approval-response', 'ping'])
  vi.advanceTimersByTime(1000)

  await expect(result).resolves.toBe(false)
  expect(listening()).toBe(0)
  vi.useRealTimers()
})

test('a relay the computer names is taken only as an address to dial', () => {
  expect(isRelayAddress('wss://relay-worker.soromi.dev')).toBe(true)
  expect(isRelayAddress('ws://192.168.1.20:8787')).toBe(true)
  expect(isRelayAddress('relay-worker.soromi.dev')).toBe(false)
  expect(isRelayAddress('https://relay.example.com')).toBe(false)
  expect(isRelayAddress('')).toBe(false)
})
