//Types
import type { Status } from '@soromi/protocol'
import type { Notification, Notifier } from './notifier'

const NOTIFY_STATES: ReadonlySet<Status> = new Set(['waiting-input', 'blocked', 'done'])
const DEBOUNCE_MS = 3500

interface WorkspaceState {
  status: Status
  timer: ReturnType<typeof setTimeout> | null
  fired: boolean
}

/**
 * Decides when to fire notifications from status transitions. Fires on entering an
 * attention state (waiting-input / blocked / done) after a debounce, at most once per
 * episode (re-armed when the workspace leaves the attention states). Per-workspace mute.
 */
export class NotificationController {
  private readonly states = new Map<string, WorkspaceState>()
  private readonly muted = new Set<string>()

  constructor(
    private readonly notifier: Notifier,
    private readonly debounceMs = DEBOUNCE_MS,
  ) {}

  setMuted(workspace: string, muted: boolean): void {
    if (muted) this.muted.add(workspace)
    else this.muted.delete(workspace)
  }

  handle(workspace: string, status: Status): void {
    const state = this.states.get(workspace) ?? { status: 'idle', timer: null, fired: false }
    state.status = status
    this.states.set(workspace, state)

    if (!NOTIFY_STATES.has(status)) {
      if (state.timer) {
        clearTimeout(state.timer)
        state.timer = null
      }
      state.fired = false
      return
    }

    if (state.fired || state.timer) return
    state.timer = setTimeout(() => {
      state.timer = null
      if (!NOTIFY_STATES.has(state.status)) return
      state.fired = true
      if (!this.muted.has(workspace)) this.notifier.notify(messageFor(workspace, state.status))
    }, this.debounceMs)
  }

  dispose(): void {
    for (const state of this.states.values()) {
      if (state.timer) clearTimeout(state.timer)
    }
    this.states.clear()
  }
}

function messageFor(workspace: string, status: Status): Notification {
  const text =
    status === 'waiting-input'
      ? 'needs your input'
      : status === 'blocked'
        ? 'is blocked'
        : 'finished'
  return { title: 'Soromi', message: `"${workspace}" ${text}`, sound: true }
}
