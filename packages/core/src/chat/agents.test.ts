import { describe, expect, it } from 'vitest'

import { agentLabel, agentOptionsFor, sessionAgentFor } from './agents'
import { permissionLabel } from './permissions'

const profiles = [
  { name: 'work', providers: { claude: {}, codex: {} } },
  { name: 'home', providers: { grok: {} } },
]

describe('agentOptionsFor', () => {
  it('keeps the bound agents whose account configures them', () => {
    const bindings = [
      { id: 'work', agent: 'claude' },
      { id: 'work', agent: 'grok' },
      { id: 'missing', agent: 'codex' },
    ]

    expect(agentOptionsFor(bindings, profiles, false)).toEqual([
      { agent: 'claude', accountLabel: 'work', label: 'Claude' },
    ])
  })

  it('adds providers that have an account but no binding, when asked', () => {
    const options = agentOptionsFor([{ id: 'work', agent: 'claude' }], profiles)

    expect(options.map((option) => option.agent)).toEqual(['claude', 'codex', 'grok'])
    expect(options[2]).toEqual({
      agent: 'grok',
      account: 'home',
      accountLabel: 'home',
      label: 'Grok',
    })
  })

  it('keeps every binding until the profiles have loaded', () => {
    const bindings = [
      { id: 'work', agent: 'claude' },
      { id: 'missing', agent: 'codex' },
    ]

    expect(agentOptionsFor(bindings, [], false)).toHaveLength(2)
  })
})

describe('labels', () => {
  it('name a provider, falling back to its key', () => {
    expect(agentLabel('codex')).toBe('Codex')
    expect(agentLabel('other')).toBe('other')
  })

  it('name a permission mode', () => {
    expect(permissionLabel('default')).toBe('Ask')
    expect(permissionLabel('plan')).toBe('Plan')
  })
})

describe('sessionAgentFor', () => {
  const bindings = [{ id: 'work', agent: 'codex' }]

  it('starts under the workspace’s first agent, leaving the account to the daemon', () => {
    expect(sessionAgentFor(bindings, profiles)).toEqual({ agent: 'codex' })
  })

  it('starts under the agent picked, binding its account when it comes with one', () => {
    expect(sessionAgentFor(bindings, profiles, { agent: 'codex' })).toEqual({ agent: 'codex' })
    expect(sessionAgentFor(bindings, profiles, { agent: 'grok', account: 'home' })).toEqual({
      agent: 'grok',
      account: 'home',
    })
  })

  it('binds an agent the workspace does not have to the first account that configures it', () => {
    expect(sessionAgentFor([], profiles)).toEqual({ agent: 'claude', account: 'work' })
    expect(sessionAgentFor(bindings, profiles, { agent: 'grok' })).toEqual({
      agent: 'grok',
      account: 'home',
    })
    expect(sessionAgentFor([], [])).toEqual({ agent: 'claude', account: 'personal' })
  })
})
