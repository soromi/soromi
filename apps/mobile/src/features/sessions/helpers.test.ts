import { expect, test } from 'vitest'

import {
  findOpened,
  getAttention,
  getOtherView,
  getRowKey,
  getSessionCount,
  getSessionDetail,
  getSessionLine,
  getSessionName,
  getTally,
  getUsageLabel,
  isSeen,
  toCardRows,
  toSections,
} from './helpers'

//Type
import type { SessionSummary, Status, WorkspaceSummary } from '@soromi/protocol'

const session = (id: string, status: Status = 'idle', title?: string): SessionSummary => ({
  id,
  agent: 'claude',
  account: 'work',
  status,
  mode: 'chat',
  permissionMode: 'default',
  title,
})

const workspace = (name: string, sessions: SessionSummary[] = []): WorkspaceSummary => ({
  name,
  status: 'idle',
  root: `/code/${name}`,
  folders: [],
  accounts: [],
  sessions,
})

test('only the first workspace starts open, until one is opened or folded by hand', () => {
  const workspaces = [workspace('one'), workspace('two'), workspace('three')]

  expect(toSections(workspaces, {}).map((section) => section.open)).toEqual([true, false, false])
  expect(
    toSections(workspaces, { one: true, three: false }).map((section) => section.open),
  ).toEqual([false, false, true])
})

test('a workspace that is folded away keeps its heading and lists no sessions', () => {
  const workspaces = [workspace('one', [session('a')]), workspace('two', [session('b')])]
  const sections = toSections(workspaces, { two: true })

  expect(sections.map((section) => section.open)).toEqual([true, false])
  expect(sections[0].data).toHaveLength(1)
  expect(sections[1].data).toEqual([])
  // What it holds is still known, for its heading's tally.
  expect(sections[1].workspace.sessions).toHaveLength(1)
})

test('a workspace is summed up by its sessions at work and its finished ones', () => {
  const sessions = [
    session('a', 'thinking'),
    session('b', 'waiting-input'),
    session('c', 'blocked'),
    session('d', 'done'),
    session('e', 'idle'),
  ]

  expect(getTally(sessions)).toEqual({ running: 3, review: 1 })
  expect(getTally([session('e')])).toEqual({ running: 0, review: 0 })
})

test('the session that appears after asking for one is the new one, if it comes soon', () => {
  const pending = { known: ['a'], at: 1_000 }
  const sessions = [session('a'), session('b')]

  expect(findOpened(sessions, pending, 2_000)?.id).toBe('b')
  expect(findOpened([session('a')], pending, 2_000)).toBeUndefined()
  // Much later, a new session is someone else's.
  expect(findOpened(sessions, pending, 60_000)).toBeUndefined()
})

test('sessions with no title are told apart by a number after their account', () => {
  const peers = [session('a'), session('b'), session('c', 'idle', 'Search')]

  expect(getSessionName(peers[0], peers)).toBe('work')
  expect(getSessionName(peers[1], peers)).toBe('work 1')
  expect(getSessionName(peers[2], peers)).toBe('Search')
})

test('a banner is not worth showing only for the session that is on screen', () => {
  expect(isSeen('a', { active: true, session: 'a' })).toBe(true)
  // Another session is open, or the list is.
  expect(isSeen('a', { active: true, session: 'b' })).toBe(false)
  expect(isSeen('a', { active: true })).toBe(false)
  // The app is behind another one, with that session still open in it.
  expect(isSeen('a', { active: false, session: 'a' })).toBe(false)
  // A banner about no session in particular.
  expect(isSeen(undefined, { active: true })).toBe(false)
})

test("the grid has a workspace's sessions in rows, the last one as short as it comes", () => {
  const sessions = [session('a'), session('b'), session('c')]
  const rows = toCardRows(sessions, 2)

  expect(rows.map((row) => row.map((one) => one.id))).toEqual([['a', 'b'], ['c']])
  expect(rows.map(getRowKey)).toEqual(['a', 'c'])
  expect(toCardRows([], 2)).toEqual([])
})

test('a workspace says how many sessions it has', () => {
  expect(getSessionCount(0)).toBe('No sessions')
  expect(getSessionCount(1)).toBe('1 session')
  expect(getSessionCount(10)).toBe('10 sessions')
})

test('what needs the person comes from every workspace, the stuck first', () => {
  const web = workspace('web', [
    session('a', 'done'),
    session('b', 'idle'),
    session('c', 'thinking'),
  ])
  const api = workspace('api', [session('d', 'waiting-input'), session('e', 'blocked')])

  const found = getAttention([web, api])

  expect(found.map((one) => one.session.id)).toEqual(['e', 'd', 'a'])
  expect(found.map((one) => one.workspace)).toEqual(['api', 'api', 'web'])
  expect(found[2].peers).toBe(web.sessions)
  expect(getAttention([workspace('quiet', [session('f')])])).toEqual([])
})

test('the header offers the view that is not showing', () => {
  expect(getOtherView('list')).toBe('grid')
  expect(getOtherView('grid')).toBe('list')
})

test('a session whose turn is over counts as working while its background agents run', () => {
  const agents = [{ name: 'explore', status: 'thinking' as Status, started_at: null }]
  const resting = { ...session('a', 'done'), subagents: agents }

  expect(getSessionDetail(resting)).toBe('1 agent working in the background')
  expect(getTally([resting])).toEqual({ running: 1, review: 0 })
  // While its own turn runs it says what that is doing, as ever.
  expect(getSessionDetail({ ...session('a', 'thinking'), subagents: agents })).toBe('Working…')
})

test('the usage row says each agent and its percent', () => {
  expect(
    getUsageLabel([
      { agent: 'claude', windows: [{ label: '5h', percent: 9.2 }] },
      { agent: 'codex', windows: [{ label: '5h', percent: 61.5 }] },
    ]),
  ).toBe('Usage: Claude 9%, Codex 62%')
  expect(getUsageLabel([])).toBe('Usage')
})

test('a session says how long ago it changed, unless it is at work now', () => {
  const now = 1_700_010_000
  expect(getSessionLine({ ...session('a', 'done'), updated: now - 2 * 3600 }, now)).toBe(
    'Finished · 2h ago',
  )
  expect(getSessionLine({ ...session('a', 'thinking'), updated: now - 60 }, now)).toBe('Working…')
  // Not changed since the computer started: no time to say.
  expect(getSessionLine(session('a', 'done'), now)).toBe('Finished')
})
