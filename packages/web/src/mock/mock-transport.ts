//Packages
import type { Transport } from '@soromi/client'

//Types
import type { ClientMessage, ServerMessage, WorkspaceSummary } from '@soromi/protocol'

/** Canned workspaces so the mobile UI renders with no daemon and no relay. */
const MOCK_WORKSPACES: WorkspaceSummary[] = [
  {
    name: 'Soromi',
    status: 'thinking',
    root: '/Users/you/work/soromi',
    folders: ['.'],
    accounts: [{ id: 'personal', agent: 'claude' }],
    sessions: [
      { id: 'sess-1', agent: 'claude', account: 'personal', status: 'thinking', title: 'daemon' },
      { id: 'sess-2', agent: 'claude', account: 'personal', status: 'idle', title: 'gui' },
    ],
  },
  {
    name: 'Storefront',
    status: 'waiting-input',
    root: '/Users/you/work/storefront',
    folders: ['api', 'web'],
    accounts: [{ id: 'work', agent: 'claude' }],
    sessions: [
      { id: 'sess-3', agent: 'claude', account: 'work', status: 'waiting-input', title: 'api' },
    ],
  },
  {
    name: 'Scratch',
    status: 'idle',
    root: '/Users/you/work/scratch',
    folders: ['.'],
    accounts: [{ id: 'personal', agent: 'codex' }],
    sessions: [{ id: 'sess-4', agent: 'codex', account: 'personal', status: 'idle' }],
  },
]

const PROMPT = '\x1b[38;5;114m❯\x1b[0m '

/** A fake terminal banner shown on attach, so the pane is not empty in the mock. */
function banner(session: string): string {
  const workspace = MOCK_WORKSPACES.find((w) => w.sessions.some((s) => s.id === session))
  return [
    '\x1b[2J\x1b[H',
    `\x1b[38;5;114mSoromi\x1b[0m mock terminal for \x1b[1m${workspace?.name ?? session}\x1b[0m\r\n`,
    '\x1b[38;5;244mThis is placeholder output. Type to echo.\x1b[0m\r\n\r\n',
    PROMPT,
  ].join('')
}

/**
 * A stand-in Transport that emits canned protocol messages, so the whole mobile UI can be built
 * and iterated without the relay, the daemon, or any crypto. The real remote transport will
 * implement the same interface, so nothing above it changes when it lands.
 */
export class MockTransport implements Transport {
  private readonly messageListeners = new Set<(message: ServerMessage) => void>()
  private readonly openListeners = new Set<() => void>()
  private readonly closeListeners = new Set<() => void>()
  private open = false

  connect(): void {
    // Defer, so listeners subscribed right after connect() still receive the initial state.
    setTimeout(() => {
      this.open = true
      for (const listener of this.openListeners) listener()
      this.emit({ type: 'workspace-list', workspaces: MOCK_WORKSPACES })
      this.emit({ type: 'keep-awake', active: false, mode: 'off' })
      this.emit({ type: 'account-list', accounts: [] })
    }, 0)
  }

  send(message: ClientMessage): void {
    switch (message.type) {
      case 'list-workspaces':
        this.emit({ type: 'workspace-list', workspaces: MOCK_WORKSPACES })
        break
      case 'attach':
        this.emit({ type: 'output', session: message.session, data: banner(message.session) })
        this.emit({ type: 'status', session: message.session, status: 'idle' })
        break
      case 'input':
        // Echo typed characters; turn Enter into a newline and a fresh prompt.
        this.emit({
          type: 'output',
          session: message.session,
          data: message.data === '\r' ? `\r\n${PROMPT}` : message.data,
        })
        break
      case 'list-skills':
        this.emit({
          type: 'skill-list',
          session: message.session,
          skills: [
            { name: 'review', description: 'Review the diff', kind: 'command', scope: 'project' },
            { name: 'test', description: 'Run the tests', kind: 'command', scope: 'user' },
          ],
        })
        break
      case 'list-dir':
        this.emit({
          type: 'dir-listing',
          workspace: message.workspace,
          path: message.path,
          entries: [
            { name: 'src', type: 'dir', ignored: false },
            { name: 'package.json', type: 'file', ignored: false },
            { name: 'node_modules', type: 'dir', ignored: true },
          ],
        })
        break
      default:
        break
    }
  }

  onMessage(listener: (message: ServerMessage) => void): () => void {
    this.messageListeners.add(listener)
    return () => {
      this.messageListeners.delete(listener)
    }
  }

  onOpen(listener: () => void): () => void {
    this.openListeners.add(listener)
    return () => {
      this.openListeners.delete(listener)
    }
  }

  onClose(listener: () => void): () => void {
    this.closeListeners.add(listener)
    return () => {
      this.closeListeners.delete(listener)
    }
  }

  isOpen(): boolean {
    return this.open
  }

  close(): void {
    this.open = false
    for (const listener of this.closeListeners) listener()
    this.messageListeners.clear()
    this.openListeners.clear()
    this.closeListeners.clear()
  }

  private emit(message: ServerMessage): void {
    for (const listener of this.messageListeners) listener(message)
  }
}
