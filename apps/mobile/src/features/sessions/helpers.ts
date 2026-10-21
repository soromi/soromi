import { runningAgents, sessionStatus } from '@soromi/core'

//Config
import { routes } from '@/config/router'

//Constants
import { SESSIONS } from './constants/sessions'

//Type
import type { SessionSummary, WorkspaceSummary } from '@soromi/protocol'
import type { Href } from 'expo-router'
import type { SessionsView } from '@/states/preferences/preferences.state.type'
import type { BannerView, GridSection, PendingSession, SessionSection, Tally } from './types'

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

export const getSessionKey = (session: SessionSummary): string => session.id

/** Where a session's conversation lives. */
export const getSessionHref = (id: string): Href => ({
  pathname: routes.app.session,
  params: { id },
})

/**
 * Every workspace as a list section. One that is folded away keeps its heading and lists no
 * sessions.
 */
export const toSections = (
  workspaces: WorkspaceSummary[],
  collapsed: Record<string, boolean>,
): SessionSection[] =>
  workspaces.map((workspace) => {
    const open = !collapsed[workspace.name]

    return { title: workspace.name, workspace, open, data: open ? workspace.sessions : [] }
  })

/**
 * Every workspace as a section of the grid: its sessions in rows of `columns` cards. One that is
 * folded away keeps its heading and has no rows.
 */
export const toGridSections = (
  workspaces: WorkspaceSummary[],
  collapsed: Record<string, boolean>,
  columns: number,
): GridSection[] =>
  toSections(workspaces, collapsed).map((section) => {
    const rows: SessionSummary[][] = []
    for (let start = 0; start < section.data.length; start += columns) {
      rows.push(section.data.slice(start, start + columns))
    }

    return { ...section, data: rows }
  })

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
