import type { UsageLevel } from '@soromi/core'
import type { AgentUsage, UsageWindow } from '@soromi/protocol'

//Type
import type { TextTone } from '@/config/theme'

export type AgentCardProps = {
  usage: AgentUsage
  /** Unix seconds: what the windows' resets are counted from. */
  now: number
  /** Without a card of its own: on a sheet, which is one already. */
  bare?: boolean
}

export type UsageLineProps = {
  workspace: string
}

export type UsageSheetProps = {
  visible: boolean
  agents: AgentUsage[]
  now: number
  refreshing: boolean
  /** The link is up: a reading can be asked for. */
  online: boolean
  onRefresh: () => void
  onClose: () => void
}

export type WindowBarProps = {
  window: UsageWindow
  now: number
}

export type ManagePlanProps = {
  agent: string
  /** The agent's page for its plan, opened in the browser. */
  url: string
}

export type UsageConfig = {
  title: string
  /** Under the title: whose usage it is, and where it comes from. */
  intro: (workspace: string) => string
  /** The header's button, for a screen reader. */
  refresh: string
  loading: string
  /** No reading yet, and no link to ask for one. */
  offline: string
  /** The computer read nothing: no session, or no agent signed in. */
  empty: { title: string; hint: string }
  /** The row that opens an agent's plan page. */
  manage: (agent: string) => string
  /** What that row does, for a screen reader. */
  manageHint: string
  /** The sheet's button, while it can be pressed and while its reading is under way. */
  again: { label: string; busy: string }
  /** Under a chat's box: the workspace's usage in a line. */
  line: {
    /** What a tap does, for a screen reader. */
    hint: string
  }
  /** The colour of a percent, by how full its window is. */
  tones: Record<UsageLevel, TextTone>
}
