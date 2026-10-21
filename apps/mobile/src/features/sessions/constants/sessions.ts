//Type
import type { SessionsConfig } from '../types'

export const SESSIONS: SessionsConfig = {
  detail: {
    thinking: 'Working…',
    'waiting-input': 'Waiting for you',
    blocked: 'Needs attention',
    done: 'Finished',
  },
  modes: {
    chat: 'Chat',
    terminal: 'Terminal',
  },
  agents: {
    one: 'agent working in the background',
    many: 'agents working in the background',
  },
  tally: {
    idle: 'Idle',
    running: ['thinking', 'waiting-input', 'blocked'],
  },
  group: {
    open: 'Show sessions',
    close: 'Hide sessions',
  },
  create: {
    label: 'New session',
    title: 'New session with',
    mode: 'chat',
    waitMs: 10_000,
  },
  menu: {
    rename: 'Rename',
    renameHint: 'Leave it empty to go back to the account’s name.',
    title: 'Session name',
    save: 'Save',
    close: 'Close session',
    closeHint: 'Ends it on your computer. Its conversation is kept there.',
  },
  empty: {
    online: 'No workspaces on your computer yet.',
    offline: 'Nothing to show while offline.',
    pick: 'Pick a session to open it here.',
  },
  view: {
    grid: 'Show as a grid',
    list: 'Show as a list',
  },
}
