//Types
import type { AgentUsage } from '@soromi/protocol'

/** How often plan usage is asked for again while it is shown: the daemon's cache window. */
export const USAGE_REFRESH_MS = 15 * 60 * 1000

/** Each agent's name as usage shows it, and the page where its plan is managed. */
const AGENTS: Record<string, { name: string; manageUrl: string }> = {
  claude: { name: 'Claude', manageUrl: 'https://claude.ai/settings/usage' },
  codex: { name: 'Codex', manageUrl: 'https://chatgpt.com/codex/settings/usage' },
}

/** From this percent a window is filling up, and from the next it is at its limit. */
const FILLING_PERCENT = 75
const FULL_PERCENT = 90

/** How full a usage window is, in a word: room to spare, filling up, or at its limit. */
export type UsageLevel = 'room' | 'filling' | 'full'

/** What the rolling windows the daemon reports are called. */
const WINDOWS: Record<string, string> = { '5h': 'Session · 5h', '7d': 'Weekly' }

/** An agent's name as usage shows it: `Claude` for `claude`; one not known keeps its key. */
export const usageAgentName = (agent: string): string => AGENTS[agent]?.name ?? agent

/** Where an agent's plan is managed, `null` for one with no such page. */
export const usageManageUrl = (agent: string): string | null => AGENTS[agent]?.manageUrl ?? null

/** A usage window's name: `Weekly` for `7d`; one not known keeps the daemon's label. */
export const usageWindowLabel = (label: string): string => WINDOWS[label] ?? label

/** How full a window is, from 0 to 1, for a bar: the daemon's percent can run past 100. */
export const usageFill = (percent: number): number => Math.min(1, Math.max(0, percent / 100))

/** How full a window is, by its percent: what a bar or a number is coloured by. */
export function usageLevel(percent: number): UsageLevel {
  if (percent >= FULL_PERCENT) return 'full'
  if (percent >= FILLING_PERCENT) return 'filling'

  return 'room'
}

/**
 * When a window rolls over, as it is said: "Resets in 2d 4h", "Resets in 3h 12m", "Resets in 45m",
 * or "Resets soon" once it is due. `resetsAt` and `now` are Unix seconds.
 */
export function usageResets(resetsAt: number, now: number): string {
  const seconds = Math.round(resetsAt - now)
  if (seconds <= 0) return 'Resets soon'
  const days = Math.floor(seconds / 86_400)
  const hours = Math.floor((seconds % 86_400) / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  if (days > 0) return `Resets in ${days}d ${hours}h`
  if (hours > 0) return `Resets in ${hours}h ${minutes}m`

  return `Resets in ${minutes}m`
}

/** The first of the agents' windows to roll over, in Unix seconds; `null` when none says when. */
export function usageSoonestReset(agents: AgentUsage[]): number | null {
  const resets = agents.flatMap((agent) =>
    agent.windows.flatMap((window) => (window.resetsAt === undefined ? [] : [window.resetsAt])),
  )

  return resets.length > 0 ? Math.min(...resets) : null
}

/**
 * Usage in a glance: each agent that reports any, with its first window's percent (the session
 * window, the one that runs out first), rounded.
 */
export function usageGlance(agents: AgentUsage[]): { agent: string; percent: number }[] {
  return agents.flatMap((agent) =>
    agent.windows.length > 0
      ? [{ agent: agent.agent, percent: Math.round(agent.windows[0].percent) }]
      : [],
  )
}

/** Usage as it is said, for a screen reader: "Claude 9%, Codex 62%", by each agent's first window. */
export function usageSummary(agents: AgentUsage[]): string {
  return usageGlance(agents)
    .map((one) => `${usageAgentName(one.agent)} ${one.percent}%`)
    .join(', ')
}
