import { relayClose } from '@soromi/core'
import { expect, test } from 'vitest'

import { getStatusAfterClose, getStatusFromClose, isRetryable } from './link.helpers'

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
