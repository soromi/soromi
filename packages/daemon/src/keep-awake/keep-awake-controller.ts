//Types
import type { KeepAwakeMode, Status } from '@soromi/protocol'
import type { KeepAwake } from './keep-awake'

/** Statuses where the agent is actively working, so the machine must stay awake. */
const WORKING: ReadonlySet<Status> = new Set<Status>(['thinking'])

/**
 * Holds the machine awake according to the selected mode:
 *   - `off`: never.
 *   - `working`: while any workspace's agent is actively working (idle, waiting-input, done,
 *     and blocked all release, since the agent is paused or finished).
 *   - `always`: unconditionally.
 * Engages/releases the underlying `KeepAwake` only on a real transition.
 */
export class KeepAwakeController {
  private readonly working = new Set<string>()
  private active = false

  constructor(
    private readonly keepAwake: KeepAwake,
    private mode: KeepAwakeMode = 'off',
  ) {}

  /** Updates from a workspace's status; returns true if the engaged state changed. */
  handle(workspace: string, status: Status): boolean {
    if (WORKING.has(status)) this.working.add(workspace)
    else this.working.delete(workspace)
    return this.recompute()
  }

  /** Switches mode; returns true if the engaged state changed. */
  setMode(mode: KeepAwakeMode): boolean {
    this.mode = mode
    return this.recompute()
  }

  getMode(): KeepAwakeMode {
    return this.mode
  }

  isActive(): boolean {
    return this.active
  }

  dispose(): void {
    this.working.clear()
    if (this.active) {
      this.active = false
      this.keepAwake.release()
    }
  }

  private recompute(): boolean {
    const next = this.mode === 'always' ? true : this.mode === 'off' ? false : this.working.size > 0
    if (next === this.active) return false
    this.active = next
    if (next) this.keepAwake.engage()
    else this.keepAwake.release()
    return true
  }
}
