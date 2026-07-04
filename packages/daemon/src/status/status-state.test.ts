import { describe, expect, it } from 'vitest'

//
import { StatusState } from './status-state'

describe('StatusState', () => {
  it('starts idle by default', () => {
    expect(new StatusState().get()).toBe('idle')
  })

  it('reports a change when the parsed status differs', () => {
    const state = new StatusState()
    expect(state.update('Reading the file')).toBe('thinking')
    expect(state.get()).toBe('thinking')
  })

  it('returns null when the status is unchanged', () => {
    const state = new StatusState()
    state.update('Reading the file')
    expect(state.update('Editing the file')).toBe(null)
  })

  it('returns null for output with no signal', () => {
    expect(new StatusState().update('the quick brown fox')).toBe(null)
  })

  it('transitions between states', () => {
    const state = new StatusState()
    expect(state.update('Reading')).toBe('thinking')
    expect(state.update('Allow write? (y/n)')).toBe('waiting-input')
  })
})
