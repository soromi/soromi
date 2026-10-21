import type { SessionMode, SessionSummary, Status, WorkspaceSummary } from '@soromi/protocol'

//Type
import type { SessionsView } from '@/states/preferences/preferences.state.type'

/** One workspace as a list section: its sessions when it is open, none when it is folded away. */
export type SessionSection = {
  title: string
  workspace: WorkspaceSummary
  open: boolean
  data: SessionSummary[]
}

/** One workspace in the grid: its sessions in rows of cards, none when it is folded away. */
export type GridSection = {
  title: string
  workspace: WorkspaceSummary
  open: boolean
  data: SessionSummary[][]
}

/** The session a menu is about. */
export type SessionTarget = {
  id: string
  name: string
}

export type RowProps = {
  session: SessionSummary
  /** The other sessions of its workspace, which decide how it is named. */
  peers: SessionSummary[]
  /** The session that is open beside the list, which is marked. */
  active?: boolean
  /** A long press asks for what can be done with the session. */
  onMenu: (target: SessionTarget) => void
}

export type CardProps = {
  session: SessionSummary
  /** The other sessions of its workspace, which decide how it is named. */
  peers: SessionSummary[]
  /** A long press asks for what can be done with the session. */
  onMenu: (target: SessionTarget) => void
}

export type CardRowProps = {
  sessions: SessionSummary[]
  peers: SessionSummary[]
  /** How many cards a full row holds: a short one leaves the rest of it empty. */
  columns: number
  onMenu: (target: SessionTarget) => void
}

export type ListProps = {
  /** The id of the session open beside the list, if one is. */
  active?: string
}

export type PlaceholderProps = {
  online: boolean
}

export type HeadingProps = {
  workspace: WorkspaceSummary
  /** Whether its sessions are shown. */
  open: boolean
}

export type TallyProps = {
  sessions: SessionSummary[]
}

/** How many of a workspace's sessions want attention. */
export type Tally = {
  /** Working, waiting on the user, or blocked. */
  running: number
  /** Finished, and not looked at since. */
  review: number
}

export type NewSessionProps = {
  workspace: WorkspaceSummary
}

export type MenuProps = {
  /** The session the menu is about, or `null` while it is closed. */
  target: SessionTarget | null
  onClose: () => void
}

/** A new session that was asked for and has not appeared yet. */
export type PendingSession = {
  /** The sessions the workspace had when it was asked for. */
  known: string[]
  /** When it was asked for (Unix milliseconds). */
  at: number
}

export type EmptyProps = {
  online: boolean
  /** Whether the first workspace list has arrived. */
  ready: boolean
}

export type SessionsConfig = {
  /** What a session is up to when it reports no activity of its own, by status. */
  detail: Record<Exclude<Status, 'idle'>, string>
  /** An idle session is described by how it is shown. */
  modes: Record<SessionSummary['mode'], string>
  /** After their number: a session whose turn is over, with agents it started still running. */
  agents: {
    one: string
    many: string
  }
  tally: {
    /** In place of the counts, when no session wants attention. */
    idle: string
    /** The statuses counted as a session at work: running, waiting on the user, or blocked. */
    running: Status[]
  }
  /** What a tap on a workspace's heading does, for a screen reader. */
  group: {
    open: string
    close: string
  }
  create: {
    label: string
    /** Above the agents to pick from, when the workspace runs more than one. */
    title: string
    /** How a session started from the phone runs: one that takes messages. */
    mode: SessionMode
    /** How long a session just asked for is waited on before the app stops expecting it. */
    waitMs: number
  }
  /** What a long press on a session offers. */
  menu: {
    rename: string
    renameHint: string
    /** In the box a new name is typed in, while it is empty. */
    title: string
    save: string
    close: string
    closeHint: string
  }
  empty: {
    online: string
    offline: string
    /** Beside the sessions column, while no session is open. */
    pick: string
  }
  /** What the header's button does, by the view it changes to, for a screen reader. */
  view: Record<SessionsView, string>
}

/** What the person has in front of them when a banner arrives. */
export type BannerView = {
  /** Whether the app is the one on screen. */
  active: boolean
  /** The session open in it, if one is. */
  session?: string
}
