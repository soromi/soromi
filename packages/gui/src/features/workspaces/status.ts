//Types
import type { Status } from '@soromi/protocol'

/** Four user-facing buckets the five raw statuses roll up into. */
export type Tone = 'running' | 'attention' | 'finished' | 'idle'

/** Maps a raw agent status to its tone. */
export function statusTone(status: Status): Tone {
  switch (status) {
    case 'thinking':
      return 'running'
    case 'waiting-input':
    case 'blocked':
      return 'attention'
    case 'done':
      return 'finished'
    default:
      return 'idle'
  }
}

/**
 * The line shown under a workspace name in the switcher. A finished-but-unseen workspace reads
 * "needs review"; otherwise it reflects the agent's real status — including the one you're viewing,
 * which no longer masks its state behind a blanket "Active now".
 */
export function statusLabel(status: Status, needsReview: boolean): string {
  if (needsReview) return 'Finished · needs review'

  switch (statusTone(status)) {
    case 'running':
      return 'Running…'
    case 'attention':
      return status === 'blocked' ? 'Blocked' : 'Waiting for you'
    case 'finished':
      return 'Finished'
    default:
      return 'Idle'
  }
}
