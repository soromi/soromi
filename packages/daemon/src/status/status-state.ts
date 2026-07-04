import { parseStatus } from './status-parser'

//Types
import type { Status } from '@soromi/protocol'

/**
 * Tracks the current agent status derived from PTY output. Holds the last known status and
 * only reports a change when a new signal differs from it.
 */
export class StatusState {
  private current: Status

  constructor(initial: Status = 'idle') {
    this.current = initial
  }

  get(): Status {
    return this.current
  }

  /** Feeds an output chunk; returns the new status if it changed, else `null`. */
  update(chunk: string): Status | null {
    const parsed = parseStatus(chunk)
    if (parsed === null || parsed === this.current) return null
    this.current = parsed
    return parsed
  }
}
