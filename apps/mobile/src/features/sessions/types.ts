import type { AgentOption, UsageLevel } from '@soromi/core'
import type {
  AgentUsage,
  SessionMode,
  SessionSummary,
  Status,
  WorkspaceSummary,
} from '@soromi/protocol'

//Type
import type { TextTone } from '@/config/theme'
import type { SessionsView } from '@/states/preferences/preferences.state.type'

/** One workspace as a list section: its sessions when it is open, none when it is folded away. */
export type SessionSection = {
  title: string
  workspace: WorkspaceSummary
  open: boolean
  data: SessionSummary[]
}

/** A session that needs the person, with the workspace it is in. */
export type Attention = {
  session: SessionSummary
  workspace: string
  /** The other sessions of its workspace, which decide how it is named. */
  peers: SessionSummary[]
}

/** The session a menu is about. */
export type SessionTarget = {
  id: string
  name: string
  /** How it runs now: what the menu offers to switch it to is the other. */
  mode: SessionMode
}

export type RowProps = {
  session: SessionSummary
  /** Unix seconds, what how long ago it changed is counted from. */
  now: number
  /** The other sessions of its workspace, which decide how it is named. */
  peers: SessionSummary[]
  /** The session that is open beside the list, which is marked. */
  active?: boolean
  /** Not set in under a workspace's name: the workspace's own screen, which is all its. */
  flush?: boolean
  /** A long press asks for what can be done with the session. */
  onMenu: (target: SessionTarget) => void
}

export type CardProps = {
  session: SessionSummary
  now: number
  /** The other sessions of its workspace, which decide how it is named. */
  peers: SessionSummary[]
  /** A long press asks for what can be done with the session. */
  onMenu: (target: SessionTarget) => void
}

export type CardRowProps = {
  sessions: SessionSummary[]
  now: number
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
  /** Its dots ask for the workspace's menu. */
  onMore: (workspace: string) => void
}

export type TallyProps = {
  sessions: SessionSummary[]
  /** Says nothing when nothing is going on, where the row says enough without "Idle". */
  quiet?: boolean
}

export type WorkspaceRowProps = {
  workspace: WorkspaceSummary
}

export type AttentionProps = {
  items: Attention[]
  now: number
  /** A long press asks for what can be done with the session. */
  onMenu: (target: SessionTarget) => void
}

export type AttentionRowProps = {
  item: Attention
  now: number
  onMenu: (target: SessionTarget) => void
}

export type LabelProps = {
  title: string
}

export type ActionsProps = {
  workspace: WorkspaceSummary
}

export type WorkspaceSessionsProps = {
  workspace: WorkspaceSummary
}

export type WorkspaceMenuProps = {
  /** The workspace the menu is about, or `null` while it is closed. */
  workspace: string | null
  onClose: () => void
}

export type NewSessionSheetProps = {
  visible: boolean
  options: AgentOption[]
  onSelect: (key: string) => void
  onClose: () => void
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

export type EarlierProps = {
  workspace: string
}

export type UsageProps = {
  workspace: string
  /** The reading there is, which has something in it: the row is not there otherwise. */
  agents: AgentUsage[]
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
  /** Between what a session is up to and how long ago it changed. */
  separator: string
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
    /** The gear on a workspace's screen, for a screen reader. */
    settings: string
    /** The dots on a workspace's heading, for a screen reader, and the menu they open. */
    more: string
  }
  /** After their number: how many sessions a workspace has. */
  count: { none: string; one: string; many: string }
  /** The home's two parts. */
  home: {
    attention: string
    workspaces: string
    /** What a tap on a workspace does, for a screen reader. */
    open: string
  }
  /** Which sessions need the person, in the order they are listed: the most stuck first. */
  attention: { statuses: Status[] }
  /** A workspace's own screen. */
  workspace: {
    sessions: string
    empty: string
    /** Opened under a name the computer no longer has: renamed or removed. */
    missing: string
  }
  /** At the top of a workspace's screen, and in its menu: the way to its earlier conversations. */
  earlier: {
    label: string
    /** What it leads to, for a screen reader. */
    hint: string
  }
  /** At the top of a workspace's screen, and in its menu: its agents' plan usage. */
  usage: {
    label: string
    /** What it leads to, for a screen reader. */
    hint: string
    /** The colour of a percent, by how full its window is. */
    tones: Record<UsageLevel, TextTone>
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
    /** Switching to the other mode, by the mode it switches to, and what that does. */
    switchTo: Record<SessionMode, string>
    switchHint: string
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
