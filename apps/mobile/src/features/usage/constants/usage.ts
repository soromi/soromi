//Type
import type { UsageConfig } from '../types'

export const USAGE: UsageConfig = {
  title: 'Usage',
  intro: (workspace) =>
    `How much of their plans the agents in ${workspace} have used, as the computer reads it from each one’s account.`,
  refresh: 'Read usage again',
  loading: 'Reading usage…',
  offline: 'Not connected to the computer. Usage shows once it is.',
  empty: {
    title: 'No usage to show',
    hint: 'It shows for the agents this workspace’s sessions run, once they are signed in.',
  },
  manage: (agent) => `Manage ${agent} plan`,
  manageHint: 'Opens in the browser',
  again: { label: 'Read again', busy: 'Reading…' },
  line: { hint: 'Shows each window, when it resets, and the plan' },
  tones: { room: 'body', filling: 'warn', full: 'danger' },
}
