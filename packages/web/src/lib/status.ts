//Types
import type { Status } from '@soromi/protocol'

/** Maps an agent status to a CSS-module class name for its status dot. */
export function statusVariant(
  status: Status,
): 'thinking' | 'waiting' | 'blocked' | 'done' | 'idle' {
  switch (status) {
    case 'thinking':
      return 'thinking'
    case 'waiting-input':
      return 'waiting'
    case 'blocked':
      return 'blocked'
    case 'done':
      return 'done'
    default:
      return 'idle'
  }
}

/** Four user-facing buckets the five raw statuses roll up into (mirrors the desktop switcher). */
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

/** The line shown under a workspace name in the switcher. */
export function statusLabel(status: Status, active: boolean): string {
  if (active) return 'Active now'

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
