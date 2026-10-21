//Type
import type { SessionsConfig } from '../types'

export const SESSIONS: SessionsConfig = {
  detail: {
    thinking: 'Working…',
    'waiting-input': 'Waiting for you',
    blocked: 'Needs attention',
    done: 'Finished',
  },
  separator: ' · ',
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
    settings: 'Workspace settings',
    more: 'More for this workspace',
  },
  count: { none: 'No sessions', one: 'session', many: 'sessions' },
  home: {
    attention: 'Needs you',
    workspaces: 'Workspaces',
    open: 'Opens its sessions',
  },
  attention: { statuses: ['blocked', 'waiting-input', 'done'] },
  workspace: {
    sessions: 'Sessions',
    empty: 'No sessions yet. Start one above.',
    missing: 'This workspace is no longer on your computer.',
  },
  earlier: {
    label: 'Earlier conversations',
    hint: 'Carry on one this workspace had before',
  },
  usage: {
    label: 'Usage',
    hint: 'How much of their plans the agents have used',
    tones: { room: 'body', filling: 'warn', full: 'danger' },
  },
  create: {
    label: 'New session',
    title: 'New session with',
    mode: 'chat',
    waitMs: 10_000,
  },
  menu: {
    rename: 'Rename',
    switchTo: { chat: 'Switch to chat', terminal: 'Switch to terminal' },
    switchHint: 'It restarts in the other mode on your computer, and the conversation carries on.',
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
