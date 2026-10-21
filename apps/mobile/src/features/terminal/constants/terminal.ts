//Type
import type { TerminalConfig } from '../types'

export const TERMINAL: TerminalConfig = {
  views: [
    { id: 'conversation', label: 'Conversation' },
    { id: 'terminal', label: 'Terminal', icon: 'terminal' },
  ],
  initial: 'conversation',
  // The keys a phone's keyboard lacks and a terminal cannot do without, as the bytes they send.
  keys: [
    { id: 'esc', label: 'esc', data: '\u001b' },
    { id: 'tab', label: 'tab', data: '\t' },
    { id: 'interrupt', label: '^C', data: '\u0003' },
    { id: 'up', label: '↑', data: '\u001b[A' },
    { id: 'down', label: '↓', data: '\u001b[B' },
    { id: 'left', label: '←', data: '\u001b[D' },
    { id: 'right', label: '→', data: '\u001b[C' },
    { id: 'enter', label: '⏎', data: '\r' },
  ],
  shells: {
    empty: 'No terminals yet. Open one with +, and it runs on your computer in this workspace.',
    add: 'New terminal',
    close: 'Close terminal',
    rename: 'Rename terminal',
    renameHint: 'Long press to rename it.',
    name: 'Terminal name',
    save: 'Save',
    pick: 'Open a terminal in',
    root: 'root',
  },
}
