import { usageResets, usageSummary } from '@soromi/core'

//Constants
import { USAGE } from './constants/usage'

//Type
import type { AgentUsage, UsageWindow } from '@soromi/protocol'

/** A plan as the account names it, each word capitalized: `max` reads "Max". */
export const getPlanLabel = (plan: string): string =>
  plan.replace(
    /(^|[\s_-])(\w)/g,
    (_, gap: string, letter: string) => `${gap === '_' ? ' ' : gap}${letter.toUpperCase()}`,
  )

/** When a window rolls over, under its bar; `null` when the computer did not say. */
export const getResetText = (window: UsageWindow, now: number): string | null =>
  window.resetsAt === undefined ? null : usageResets(window.resetsAt, now)

export const getAgentKey = (usage: AgentUsage): string => usage.agent

/** The chat's usage line as a screen reader says it: "Usage: Claude 9%, Codex 62%". */
export const getLineLabel = (agents: AgentUsage[]): string => {
  const summary = usageSummary(agents)

  return summary ? `${USAGE.title}: ${summary}` : USAGE.title
}
