import { describe, expect, it } from 'vitest'

import {
  usageAgentName,
  usageFill,
  usageGlance,
  usageLevel,
  usageManageUrl,
  usageResets,
  usageSoonestReset,
  usageSummary,
  usageWindowLabel,
} from './usage'

import type { AgentUsage } from '@soromi/protocol'

const claude: AgentUsage = {
  agent: 'claude',
  plan: 'max',
  windows: [
    { label: '5h', percent: 9.4, resetsAt: 10_000 },
    { label: '7d', percent: 23, resetsAt: 500_000 },
  ],
}
const codex: AgentUsage = { agent: 'codex', windows: [{ label: '5h', percent: 61.5 }] }
const signedOut: AgentUsage = { agent: 'codex', windows: [], note: 'Sign in again' }

describe('usage', () => {
  it('names the agents and their windows, keeping what it does not know', () => {
    expect(usageAgentName('claude')).toBe('Claude')
    expect(usageAgentName('grok')).toBe('grok')
    expect(usageWindowLabel('5h')).toBe('Session · 5h')
    expect(usageWindowLabel('7d')).toBe('Weekly')
    expect(usageWindowLabel('30d')).toBe('30d')
    expect(usageManageUrl('codex')).toBe('https://chatgpt.com/codex/settings/usage')
    expect(usageManageUrl('grok')).toBeNull()
  })

  it('fills a bar from 0 to 1, whatever the percent', () => {
    expect(usageFill(42)).toBeCloseTo(0.42)
    expect(usageFill(130)).toBe(1)
    expect(usageFill(-3)).toBe(0)
  })

  it('tells room to spare from a window filling up or at its limit', () => {
    expect(usageLevel(0)).toBe('room')
    expect(usageLevel(74.9)).toBe('room')
    expect(usageLevel(75)).toBe('filling')
    expect(usageLevel(90)).toBe('full')
    expect(usageLevel(140)).toBe('full')
  })

  it('says how long until a window rolls over', () => {
    expect(usageResets(1000, 1000)).toBe('Resets soon')
    expect(usageResets(1000, 2000)).toBe('Resets soon')
    expect(usageResets(45 * 60, 0)).toBe('Resets in 45m')
    expect(usageResets(3 * 3600 + 12 * 60, 0)).toBe('Resets in 3h 12m')
    expect(usageResets(2 * 86_400 + 4 * 3600 + 59, 0)).toBe('Resets in 2d 4h')
  })

  it('finds the first window to roll over', () => {
    expect(usageSoonestReset([codex, claude])).toBe(10_000)
    expect(usageSoonestReset([codex, signedOut])).toBeNull()
    expect(usageSoonestReset([])).toBeNull()
  })

  it('glances at each agent that reports a window, by its first', () => {
    expect(usageGlance([claude, codex, signedOut])).toEqual([
      { agent: 'claude', percent: 9 },
      { agent: 'codex', percent: 62 },
    ])
  })

  it('says the glance in words', () => {
    expect(usageSummary([claude, codex, signedOut])).toBe('Claude 9%, Codex 62%')
    expect(usageSummary([signedOut])).toBe('')
  })
})
