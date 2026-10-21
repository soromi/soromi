import { expect, test } from 'vitest'

import { applyServerMessage } from './apply-message'
import { agentLogKey, createClientStore } from './client-store'

test('the computer is what the daemon said in its welcome, launcher and all', () => {
  const store = createClientStore()
  const host = { name: 'build-box', os: 'linux', launcher: 'service' as const }

  applyServerMessage(store.getState(), { type: 'welcome', protocol: 3, version: '1.0.0', host })

  expect(store.getState().host).toEqual(host)
  expect(store.getState().daemonVersion).toBe('1.0.0')
})

test('the computer is unknown to a daemon too old to say', () => {
  const store = createClientStore()
  store.getState().setWelcome('1.0.0', { name: 'old', os: 'macos', launcher: 'desktop' })

  applyServerMessage(store.getState(), { type: 'welcome', protocol: 3, version: '0.9.0' })

  expect(store.getState().host).toBeNull()
})

test("a watched agent's log starts over on a reset and grows after it", () => {
  const store = createClientStore()
  const says = (text: string) => ({ kind: 'assistant' as const, text })
  const log = () => store.getState().agentLogs[agentLogKey('s1', 'toolu_1')]
  const arrive = (texts: string[], reset: boolean, earlier = false) =>
    applyServerMessage(store.getState(), {
      type: 'agent-log',
      session: 's1',
      agent: 'toolu_1',
      events: texts.map(says),
      reset,
      earlier,
    })

  arrive(['one', 'two'], true, true)
  arrive(['three'], false)
  expect(log()).toEqual({
    events: [says('one'), says('two'), says('three')],
    earlier: true,
    loaded: true,
  })

  arrive(['fresh'], true)
  expect(log()).toEqual({ events: [says('fresh')], earlier: false, loaded: true })
})

test("each workspace's usage is kept apart, the latest reading replacing the one before", () => {
  const store = createClientStore()
  const usage = (workspace: string, percent: number) =>
    applyServerMessage(store.getState(), {
      type: 'usage',
      workspace,
      agents: [{ agent: 'claude', windows: [{ label: '5h', percent }] }],
    })

  usage('web', 10)
  usage('api', 40)
  usage('web', 12)

  expect(store.getState().usage.web[0].windows[0].percent).toBe(12)
  expect(store.getState().usage.api[0].windows[0].percent).toBe(40)
})
