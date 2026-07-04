import { describe, expect, it } from 'vitest'

//
import { createConnection } from './connection'

//Types
import type { KeepAwakeMode, ServerMessage, Status } from '@soromi/protocol'
import type { SessionLike } from '../sessions/session'
import type { OpenResult, WorkspaceHub } from '../workspaces/workspace-service'

function fakeSession() {
  const outputListeners = new Set<(data: string) => void>()
  const statusListeners = new Set<(status: Status) => void>()
  let currentStatus: Status = 'idle'
  return {
    written: [] as string[],
    resized: [] as Array<[number, number]>,
    snapshot: () => 'REPLAY',
    status: () => currentStatus,
    onOutput(listener: (data: string) => void) {
      outputListeners.add(listener)
      return () => outputListeners.delete(listener)
    },
    onStatus(listener: (status: Status) => void) {
      statusListeners.add(listener)
      return () => statusListeners.delete(listener)
    },
    write(data: string) {
      this.written.push(data)
    },
    resize(cols: number, rows: number) {
      this.resized.push([cols, rows])
    },
    emit(data: string) {
      for (const listener of outputListeners) listener(data)
    },
    setStatus(status: Status) {
      currentStatus = status
      for (const listener of statusListeners) listener(status)
    },
  }
}

function hubWith(
  session: ReturnType<typeof fakeSession>,
  openWorkspace?: (dir: string) => OpenResult,
) {
  const changeListeners = new Set<() => void>()
  return {
    mutes: [] as Array<[string, boolean]>,
    get: (workspace: string) => (workspace === 'kazomi' ? (session as SessionLike) : undefined),
    names: () => ['kazomi'],
    summaries: () => [
      {
        name: 'kazomi',
        status: session.status(),
        agent: 'claude',
        account: 'personal',
        folders: ['api'],
      },
    ],
    listDir: (_workspace: string, path: string) =>
      path === 'api' ? [{ name: 'src', type: 'dir' as const }] : [],
    readFile: (_workspace: string, path: string) => ({
      content: `contents of ${path}`,
      truncated: false,
      binary: false,
    }),
    createSpace: (input: { name: string }) => ({ workspace: input.name }),
    keepAwakeActive: () => false,
    keepAwakeMode: () => 'working' as const,
    keepAwakeModes: [] as KeepAwakeMode[],
    setKeepAwakeMode(mode: KeepAwakeMode) {
      this.keepAwakeModes.push(mode)
    },
    removed: [] as string[],
    removeSpace(name: string) {
      this.removed.push(name)
    },
    setMuted(workspace: string, muted: boolean) {
      this.mutes.push([workspace, muted])
    },
    onChange(listener: () => void) {
      changeListeners.add(listener)
      return () => changeListeners.delete(listener)
    },
    openWorkspace:
      openWorkspace ??
      (() => {
        throw new Error('not implemented')
      }),
    fireChange: () => {
      for (const listener of changeListeners) listener()
    },
  } satisfies WorkspaceHub & {
    fireChange: () => void
    mutes: Array<[string, boolean]>
    keepAwakeModes: KeepAwakeMode[]
    removed: string[]
  }
}

const summary = (status: Status) => ({
  name: 'kazomi',
  status,
  agent: 'claude',
  account: 'personal',
  folders: ['api'],
})

describe('createConnection', () => {
  it('lists workspaces with full summaries', () => {
    const session = fakeSession()
    session.setStatus('thinking')
    const sent: ServerMessage[] = []
    const conn = createConnection(hubWith(session), (m) => sent.push(m))
    conn.handle({ type: 'list-workspaces' })
    expect(sent).toEqual([
      { type: 'workspace-list', workspaces: [summary('thinking')] },
      { type: 'keep-awake', active: false, mode: 'working' },
    ])
  })

  it('re-sends the workspace list and keep-awake when the hub changes', () => {
    const sent: ServerMessage[] = []
    const hub = hubWith(fakeSession())
    createConnection(hub, (m) => sent.push(m))
    hub.fireChange()
    expect(sent).toEqual([
      { type: 'workspace-list', workspaces: [summary('idle')] },
      { type: 'keep-awake', active: false, mode: 'working' },
    ])
  })

  it('opens a workspace and replies with workspace-opened', () => {
    const sent: ServerMessage[] = []
    const hub = hubWith(fakeSession(), () => ({ workspace: 'kazomi', warning: 'no profile' }))
    const conn = createConnection(hub, (m) => sent.push(m))
    conn.handle({ type: 'open-workspace', dir: '/w' })
    expect(sent).toContainEqual({
      type: 'workspace-opened',
      workspace: 'kazomi',
      warning: 'no profile',
    })
  })

  it('replies with an error when opening fails', () => {
    const sent: ServerMessage[] = []
    const hub = hubWith(fakeSession(), () => {
      throw new Error('no soromi.space.json')
    })
    const conn = createConnection(hub, (m) => sent.push(m))
    conn.handle({ type: 'open-workspace', dir: '/bad' })
    expect(sent).toContainEqual({ type: 'error', message: 'no soromi.space.json' })
  })

  it('creates a space and replies with workspace-opened', () => {
    const sent: ServerMessage[] = []
    const conn = createConnection(hubWith(fakeSession()), (m) => sent.push(m))
    conn.handle({
      type: 'create-space',
      name: 'kazomi',
      root: '/w/kazomi',
      agent: 'claude',
      account: 'personal',
    })
    expect(sent).toContainEqual({
      type: 'workspace-opened',
      workspace: 'kazomi',
      warning: undefined,
    })
  })

  it('forwards remove-space to the hub', () => {
    const hub = hubWith(fakeSession())
    const conn = createConnection(hub, () => {})
    conn.handle({ type: 'remove-space', workspace: 'kazomi' })
    expect(hub.removed).toEqual(['kazomi'])
  })

  it('saves an account and replies with the account list', () => {
    const saved: Array<{ name: string }> = []
    const accounts = {
      list: () => saved,
      save: (p: { name: string }) => {
        saved.push(p)
      },
      remove: () => {},
    }
    const sent: ServerMessage[] = []
    const conn = createConnection(hubWith(fakeSession()), (m) => sent.push(m), accounts)
    const profile = { name: 'work', providers: {} }
    conn.handle({ type: 'save-account', profile })
    expect(saved).toEqual([profile])
    expect(sent).toContainEqual({ type: 'account-list', accounts: [profile] })
  })

  it('forwards mute-workspace to the hub', () => {
    const hub = hubWith(fakeSession())
    const conn = createConnection(hub, () => {})
    conn.handle({ type: 'mute-workspace', workspace: 'kazomi', muted: true })
    expect(hub.mutes).toEqual([['kazomi', true]])
  })

  it('forwards set-keep-awake-mode to the hub', () => {
    const hub = hubWith(fakeSession())
    const conn = createConnection(hub, () => {})
    conn.handle({ type: 'set-keep-awake-mode', mode: 'always' })
    expect(hub.keepAwakeModes).toEqual(['always'])
  })

  it('replies to list-dir with a directory listing', () => {
    const sent: ServerMessage[] = []
    const conn = createConnection(hubWith(fakeSession()), (m) => sent.push(m))
    conn.handle({ type: 'list-dir', workspace: 'kazomi', path: 'api' })
    expect(sent).toContainEqual({
      type: 'dir-listing',
      workspace: 'kazomi',
      path: 'api',
      entries: [{ name: 'src', type: 'dir' }],
    })
  })

  it('replies to read-file with file content', () => {
    const sent: ServerMessage[] = []
    const conn = createConnection(hubWith(fakeSession()), (m) => sent.push(m))
    conn.handle({ type: 'read-file', workspace: 'kazomi', path: 'api/x.ts' })
    expect(sent).toContainEqual({
      type: 'file-content',
      workspace: 'kazomi',
      path: 'api/x.ts',
      content: 'contents of api/x.ts',
      truncated: false,
      binary: false,
    })
  })

  it('sends scrollback and current status, then streams both, on attach', () => {
    const session = fakeSession()
    const sent: ServerMessage[] = []
    const conn = createConnection(hubWith(session), (m) => sent.push(m))

    conn.handle({ type: 'attach', workspace: 'kazomi' })
    session.emit('live')
    session.setStatus('waiting-input')

    expect(sent).toEqual([
      { type: 'output', workspace: 'kazomi', data: 'REPLAY' },
      { type: 'status', workspace: 'kazomi', status: 'idle' },
      { type: 'output', workspace: 'kazomi', data: 'live' },
      { type: 'status', workspace: 'kazomi', status: 'waiting-input' },
    ])
  })

  it('does not double output when a workspace is re-attached', () => {
    const session = fakeSession()
    const sent: ServerMessage[] = []
    const conn = createConnection(hubWith(session), (m) => sent.push(m))

    conn.handle({ type: 'attach', workspace: 'kazomi' })
    conn.handle({ type: 'attach', workspace: 'kazomi' })
    sent.length = 0 // drop the two snapshot/status replays

    session.emit('live')
    expect(sent).toEqual([{ type: 'output', workspace: 'kazomi', data: 'live' }])
  })

  it('forwards input to the session', () => {
    const session = fakeSession()
    const conn = createConnection(hubWith(session), () => {})
    conn.handle({ type: 'input', workspace: 'kazomi', data: 'ls\r' })
    expect(session.written).toEqual(['ls\r'])
  })

  it('forwards resize to the session', () => {
    const session = fakeSession()
    const conn = createConnection(hubWith(session), () => {})
    conn.handle({ type: 'resize', workspace: 'kazomi', cols: 120, rows: 40 })
    expect(session.resized).toEqual([[120, 40]])
  })

  it('ignores attach for an unknown workspace', () => {
    const sent: ServerMessage[] = []
    const conn = createConnection(hubWith(fakeSession()), (m) => sent.push(m))
    conn.handle({ type: 'attach', workspace: 'nope' })
    expect(sent).toEqual([])
  })
})
