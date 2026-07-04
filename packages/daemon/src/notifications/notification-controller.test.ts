import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

//
import { NotificationController } from './notification-controller'

//Types
import type { Notification, Notifier } from './notifier'

function recordingNotifier() {
  const fired: Notification[] = []
  const notifier: Notifier = { notify: (n) => fired.push(n) }
  return { notifier, fired }
}

const DEBOUNCE = 3500

beforeEach(() => vi.useFakeTimers())
afterEach(() => vi.useRealTimers())

describe('NotificationController', () => {
  it('fires once after the debounce on entering an attention state', () => {
    const { notifier, fired } = recordingNotifier()
    const controller = new NotificationController(notifier)

    controller.handle('kazomi', 'waiting-input')
    vi.advanceTimersByTime(DEBOUNCE - 1)
    expect(fired).toHaveLength(0)
    vi.advanceTimersByTime(1)
    expect(fired).toEqual([{ title: 'Soromi', message: '"kazomi" needs your input', sound: true }])
  })

  it('cancels the notification if the state clears before the debounce', () => {
    const { notifier, fired } = recordingNotifier()
    const controller = new NotificationController(notifier)

    controller.handle('kazomi', 'waiting-input')
    controller.handle('kazomi', 'thinking')
    vi.advanceTimersByTime(DEBOUNCE)
    expect(fired).toHaveLength(0)
  })

  it('fires only once per episode', () => {
    const { notifier, fired } = recordingNotifier()
    const controller = new NotificationController(notifier)

    controller.handle('kazomi', 'waiting-input')
    vi.advanceTimersByTime(DEBOUNCE)
    controller.handle('kazomi', 'waiting-input')
    vi.advanceTimersByTime(DEBOUNCE)
    expect(fired).toHaveLength(1)
  })

  it('re-arms after leaving and re-entering an attention state', () => {
    const { notifier, fired } = recordingNotifier()
    const controller = new NotificationController(notifier)

    controller.handle('kazomi', 'waiting-input')
    vi.advanceTimersByTime(DEBOUNCE)
    controller.handle('kazomi', 'thinking')
    controller.handle('kazomi', 'blocked')
    vi.advanceTimersByTime(DEBOUNCE)
    expect(fired).toHaveLength(2)
    expect(fired[1]?.message).toBe('"kazomi" is blocked')
  })

  it('suppresses notifications for a muted workspace', () => {
    const { notifier, fired } = recordingNotifier()
    const controller = new NotificationController(notifier)

    controller.setMuted('kazomi', true)
    controller.handle('kazomi', 'done')
    vi.advanceTimersByTime(DEBOUNCE)
    expect(fired).toHaveLength(0)
  })
})
