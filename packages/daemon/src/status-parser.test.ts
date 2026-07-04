import { describe, expect, it } from 'vitest'
import { parseStatus } from './status-parser'

describe('parseStatus', () => {
  it('reads a permission prompt as waiting-input', () => {
    expect(parseStatus('? Allow write to kazomi-api/src/assembler.ts? (y/n)')).toBe('waiting-input')
  })

  it('reads work-in-progress output as thinking', () => {
    expect(parseStatus('Reading kazomi-api/src/assembler.ts…')).toBe('thinking')
  })

  it('reads a failure as blocked', () => {
    expect(parseStatus('Error: command failed')).toBe('blocked')
  })

  it('returns null for output with no status signal', () => {
    expect(parseStatus('the quick brown fox')).toBe(null)
  })
})
