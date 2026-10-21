import type { SessionSummary, Status } from '@soromi/protocol'

/** A session's sub-agents that are still running. */
export function runningAgents(session: Pick<SessionSummary, 'subagents'>): number {
  return (session.subagents ?? []).filter((agent) => agent.status === 'thinking').length
}

/**
 * A session's status as a list of sessions shows it. A session's own status is its turn's: once the
 * agent hands back, it reads idle or finished. Agents it started in the background may still be
 * running then, and it will pick up again when they report, so in a list it counts as working
 * until they stop.
 *
 * The conversation itself goes by the session's own status: with only background agents running,
 * the next message can be sent.
 */
export function sessionStatus(session: Pick<SessionSummary, 'status' | 'subagents'>): Status {
  const resting = session.status === 'idle' || session.status === 'done'

  return resting && runningAgents(session) > 0 ? 'thinking' : session.status
}
