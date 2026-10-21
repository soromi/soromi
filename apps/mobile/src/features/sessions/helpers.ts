import { conversationAge, runningAgents, sessionStatus, usageSummary } from '@soromi/core'

//Config
import { routes } from '@/config/router'

//Constants
import { SESSIONS } from './constants/sessions'

//Type
import type { AgentUsage, SessionSummary, WorkspaceSummary } from '@soromi/protocol'
import type { Href } from 'expo-router'
import type { SessionsView } from '@/states/preferences/preferences.state.type'
import type { Attention, BannerView, PendingSession, SessionSection, Tally } from './types'

/** A session's name as the desktop shows it: its own title, or the account it runs under. */
export const getSessionName = (session: SessionSummary, peers: SessionSummary[]): string => {
  if (session.title) return session.title
  const same = peers.filter((peer) => !peer.title && peer.account === session.account)
  const index = same.findIndex((peer) => peer.id === session.id)

  return index <= 0 ? session.account : `${session.account} ${index}`
}

/**
 * What a session is up to, in a line: what it reports doing, the agents it left running in the
 * background once its own turn is over, or what its status says.
 */
export const getSessionDetail = (session: SessionSummary): string => {
  if (session.activity) return session.activity
  const background = runningAgents(session)
  if (background > 0 && sessionStatus(session) !== session.status) {
    return `${background} ${background === 1 ? SESSIONS.agents.one : SESSIONS.agents.many}`
  }
  if (session.status === 'idle') return SESSIONS.modes[session.mode]

  return SESSIONS.detail[session.status]
}

/**
 * A session's line under its name: what it is up to, and how long ago it last changed ("Finished
 * · 2h ago"). One at work says only what it is doing, which is now. `now` is Unix seconds.
 */
export const getSessionLine = (session: SessionSummary, now: number): string => {
  const detail = getSessionDetail(session)
  if (session.updated === undefined || sessionStatus(session) === 'thinking') return detail

  return `${detail}${SESSIONS.separator}${conversationAge(session.updated, now)}`
}

export const getSessionKey = (session: SessionSummary): string => session.id

/** Where a workspace's sessions are, with what can be done there. */
export const getWorkspaceHref = (workspace: string): Href => ({
  pathname: routes.app.workspace,
  params: { name: workspace },
})

export const getWorkspaceKey = (workspace: WorkspaceSummary): string => workspace.name

/** How many sessions a workspace has, in words: "No sessions", "1 session", "10 sessions". */
export const getSessionCount = (count: number): string =>
  count === 0
    ? SESSIONS.count.none
    : `${count} ${count === 1 ? SESSIONS.count.one : SESSIONS.count.many}`

/**
 * The sessions that need the person, across every workspace: stuck first, then waiting for an
 * answer, then finished and not looked at since. Each keeps its workspace's order within that.
 */
export const getAttention = (workspaces: WorkspaceSummary[]): Attention[] => {
  const order = SESSIONS.attention.statuses
  const found = workspaces.flatMap((workspace) =>
    workspace.sessions
      .filter((session) => order.includes(sessionStatus(session)))
      .map((session) => ({ session, workspace: workspace.name, peers: workspace.sessions })),
  )

  return found.sort(
    (a, b) => order.indexOf(sessionStatus(a.session)) - order.indexOf(sessionStatus(b.session)),
  )
}

export const getAttentionKey = (item: Attention): string => item.session.id

/** Where a workspace's own settings are. */
export const getWorkspaceSettingsHref = (workspace: string): Href => ({
  pathname: routes.app.workspaceSettings,
  params: { name: workspace },
})

/** Where a workspace's earlier conversations are, to carry one on. */
export const getConversationsHref = (workspace: string): Href => ({
  pathname: routes.app.conversations,
  params: { name: workspace },
})

/** Where a workspace's plan usage is shown in full. */
export const getUsageHref = (workspace: string): Href => ({
  pathname: routes.app.usage,
  params: { name: workspace },
})

/** The usage row as a screen reader says it: "Usage: Claude 9%, Codex 62%". */
export const getUsageLabel = (agents: AgentUsage[]): string => {
  const summary = usageSummary(agents)

  return summary ? `${SESSIONS.usage.label}: ${summary}` : SESSIONS.usage.label
}

/** Where a session's conversation lives. */
export const getSessionHref = (id: string): Href => ({
  pathname: routes.app.session,
  params: { id },
})

/**
 * Every workspace as a list section. One that is folded away keeps its heading and lists no
 * sessions. Until one is opened or folded by hand, only the first is open, so a long list starts
 * short.
 */
export const toSections = (
  workspaces: WorkspaceSummary[],
  collapsed: Record<string, boolean>,
): SessionSection[] =>
  workspaces.map((workspace, index) => {
    const open = !(collapsed[workspace.name] ?? index > 0)

    return { title: workspace.name, workspace, open, data: open ? workspace.sessions : [] }
  })

/** A workspace's sessions in rows of `columns` cards, for the grid; the last as short as it comes. */
export const toCardRows = (sessions: SessionSummary[], columns: number): SessionSummary[][] => {
  const rows: SessionSummary[][] = []
  for (let start = 0; start < sessions.length; start += columns) {
    rows.push(sessions.slice(start, start + columns))
  }

  return rows
}

/** A row of cards is known by the first session in it. */
export const getRowKey = (row: SessionSummary[]): string => row[0]?.id ?? ''

/** The view the header's button changes to: the one that is not showing. */
export const getOtherView = (view: SessionsView): SessionsView =>
  view === 'list' ? 'grid' : 'list'

/** How many of a workspace's sessions are at work or stuck, and how many have finished. */
export const getTally = (sessions: SessionSummary[]): Tally => ({
  running: sessions.filter((session) => SESSIONS.tally.running.includes(sessionStatus(session)))
    .length,
  review: sessions.filter((session) => sessionStatus(session) === 'done').length,
})

/**
 * The session that appeared in a workspace since a new one was asked for, if that was recent
 * enough to be the one: a session the desktop opens much later is not ours to jump into.
 */
export const findOpened = (
  sessions: SessionSummary[],
  pending: PendingSession,
  now: number,
): SessionSummary | undefined => {
  if (now - pending.at > SESSIONS.create.waitMs) return undefined

  return sessions.find((session) => !pending.known.includes(session.id))
}

/**
 * Whether the person is already looking at what a banner is about: the app is on screen with that
 * session open. Anywhere else (another session, the list, another app) the banner says something
 * they cannot see.
 */
export const isSeen = (session: string | undefined, view: BannerView): boolean =>
  view.active && session !== undefined && session === view.session
