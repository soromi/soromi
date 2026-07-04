import { describe, expect, it } from 'vitest'

//
import { KeepAwakeController } from './keep-awake-controller'

//Types
import type { KeepAwake } from './keep-awake'

function recordingKeepAwake() {
  const calls: string[] = []
  const keepAwake: KeepAwake = {
    engage: () => calls.push('engage'),
    release: () => calls.push('release'),
  }
  return { keepAwake, calls }
}

describe('KeepAwakeController', () => {
  it('engages on the first busy workspace and releases when all idle', () => {
    const { keepAwake, calls } = recordingKeepAwake()
    const controller = new KeepAwakeController(keepAwake, 'working')

    expect(controller.handle('a', 'thinking')).toBe(true)
    expect(controller.isActive()).toBe(true)
    expect(controller.handle('a', 'idle')).toBe(true)
    expect(controller.isActive()).toBe(false)
    expect(calls).toEqual(['engage', 'release'])
  })

  it('stays engaged while any workspace is still working', () => {
    const { keepAwake, calls } = recordingKeepAwake()
    const controller = new KeepAwakeController(keepAwake, 'working')

    controller.handle('a', 'thinking')
    expect(controller.handle('b', 'thinking')).toBe(false)
    expect(controller.handle('a', 'done')).toBe(false)
    expect(controller.isActive()).toBe(true)
    expect(controller.handle('b', 'idle')).toBe(true)
    expect(controller.isActive()).toBe(false)
    expect(calls).toEqual(['engage', 'release'])
  })

  it('does not engage for paused or finished statuses', () => {
    const { keepAwake, calls } = recordingKeepAwake()
    const controller = new KeepAwakeController(keepAwake, 'working')

    expect(controller.handle('a', 'waiting-input')).toBe(false)
    expect(controller.handle('a', 'done')).toBe(false)
    expect(controller.handle('a', 'blocked')).toBe(false)
    expect(controller.isActive()).toBe(false)
    expect(calls).toEqual([])
  })

  it('releases when a working agent moves to a paused status', () => {
    const { keepAwake, calls } = recordingKeepAwake()
    const controller = new KeepAwakeController(keepAwake, 'working')

    controller.handle('a', 'thinking')
    expect(controller.handle('a', 'waiting-input')).toBe(true)
    expect(controller.isActive()).toBe(false)
    expect(calls).toEqual(['engage', 'release'])
  })

  it('defaults to "off" and never engages', () => {
    const { keepAwake, calls } = recordingKeepAwake()
    const controller = new KeepAwakeController(keepAwake)

    expect(controller.getMode()).toBe('off')
    expect(controller.handle('a', 'thinking')).toBe(false)
    expect(controller.isActive()).toBe(false)
    expect(calls).toEqual([])
  })

  it('never engages in "off" mode', () => {
    const { keepAwake, calls } = recordingKeepAwake()
    const controller = new KeepAwakeController(keepAwake, 'off')

    expect(controller.handle('a', 'thinking')).toBe(false)
    expect(controller.isActive()).toBe(false)
    expect(calls).toEqual([])
  })

  it('engages and stays engaged in "always" mode regardless of status', () => {
    const { keepAwake, calls } = recordingKeepAwake()
    const controller = new KeepAwakeController(keepAwake, 'always')

    // Engagement is applied on the first update, even for an idle workspace.
    expect(controller.handle('a', 'idle')).toBe(true)
    expect(controller.isActive()).toBe(true)
    expect(controller.handle('a', 'thinking')).toBe(false)
    expect(controller.isActive()).toBe(true)
    expect(calls).toEqual(['engage'])
  })

  it('engages and releases as the mode changes', () => {
    const { keepAwake, calls } = recordingKeepAwake()
    const controller = new KeepAwakeController(keepAwake, 'working')

    expect(controller.setMode('always')).toBe(true)
    expect(controller.isActive()).toBe(true)
    expect(controller.setMode('off')).toBe(true)
    expect(controller.isActive()).toBe(false)
    expect(calls).toEqual(['engage', 'release'])
  })

  it('releases on dispose', () => {
    const { keepAwake, calls } = recordingKeepAwake()
    const controller = new KeepAwakeController(keepAwake, 'working')
    controller.handle('a', 'thinking')
    controller.dispose()
    expect(controller.isActive()).toBe(false)
    expect(calls).toEqual(['engage', 'release'])
  })
})
