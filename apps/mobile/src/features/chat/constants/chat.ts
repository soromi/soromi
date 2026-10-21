//Type
import type { ChatConfig } from '../types'

export const CHAT: ChatConfig = {
  empty: {
    chat: 'No messages yet.',
    terminal: 'Nothing to show for this terminal session yet.',
  },
  composer: {
    placeholder: 'Message the agent…',
    watching: 'Take over to send a message',
    send: 'Send',
    stop: 'Stop',
    attach: 'Attach pictures',
    terminal:
      'This session runs in a terminal. Read it here, or open the Terminal tab to type into it.',
    maxHeight: 140,
  },
  attach: {
    limit: 4,
    // A message crosses the relay in one piece of at most 4 MiB, and has to leave room for its text.
    maxEncoded: 3_000_000,
    thumb: 56,
    remove: 'Remove picture',
    full: {
      title: 'No room for more',
      message: 'A message takes up to 4 pictures. Remove one to add another.',
    },
    dropped: {
      title: 'Some pictures were left out',
      message: 'Together they are too large to send in one message. Send them a few at a time.',
    },
    ok: 'OK',
  },
  model: {
    title: 'Model',
    effort: 'Effort',
    defaultKey: 'default',
  },
  permission: {
    title: 'Tool permissions',
  },
  agent: {
    title: 'Agent',
    confirm: {
      title: 'Switch agent?',
      lead: 'This chat will restart under ',
      trail: ', as a new conversation. The current one stays on your computer.',
      cancel: 'Cancel',
      confirm: 'Switch',
    },
  },
  approval: {
    lead: 'Allow ',
    trail: '?',
    allow: 'Allow',
    deny: 'Deny',
    bodyLines: 6,
  },
  panel: 'Files and skills',
  working: {
    separator: ' · ',
    arrow: '↓',
    tokens: 'tokens',
    tickMs: 1000,
  },
  tool: {
    icons: {
      edit: 'pencil',
      write: 'write',
      run: 'terminal',
      read: 'file-text',
      search: 'search',
      agent: 'bot',
      skill: 'sparkles',
      plan: 'clipboard',
      other: 'wrench',
    },
    dots: {
      running: 'thinking',
      done: 'done',
      error: 'blocked',
    },
    prompt: '$ ',
    added: '+',
    removed: '−',
    maxHeight: 280,
    maxLines: 300,
    more: 'more lines',
  },
  reasoning: {
    label: 'Thought for a few seconds',
  },
  agents: {
    one: 'agent working in the background',
    many: 'agents working in the background',
    show: 'Show',
    hide: 'Hide',
    stop: 'Stop',
    minutes: 'm',
    seconds: 's',
  },
  context: {
    lead: 'Context is ',
    trail: '% full. Compact to free up space, or the agent will compact on its own soon.',
    compact: 'Compact',
    clear: 'Clear',
    dismiss: 'Dismiss',
    commands: { compact: '/compact', clear: '/clear' },
    confirm: {
      title: 'Clear the conversation?',
      message:
        'This wipes the whole conversation: the agent loses everything said so far and starts fresh. It cannot be undone. To only free up space, compact instead.',
      cancel: 'Cancel',
      confirm: 'Clear',
    },
  },
  slash: {
    prefix: '/',
    maxHeight: 240,
  },
  files: {
    thumb: 132,
    unnamed: 'Attachment',
  },
  row: {
    earlier: 'Load earlier messages',
    interrupted: 'Interrupted',
  },
}
