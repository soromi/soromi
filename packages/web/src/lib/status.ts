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
