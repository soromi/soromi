//Types
import type { PermissionMode } from '@soromi/protocol'

/** One way a chat can handle tool permissions, as a picker shows it. */
export interface PermissionChoice {
  value: PermissionMode
  label: string
  hint: string
}

/** The permission modes, in the order they are offered. */
export const PERMISSION_MODES: PermissionChoice[] = [
  { value: 'default', label: 'Ask', hint: 'Approve tools before they run' },
  { value: 'acceptEdits', label: 'Auto-accept edits', hint: 'Edits run; ask for the rest' },
  { value: 'bypassPermissions', label: 'Bypass', hint: 'Run everything without asking' },
  { value: 'plan', label: 'Plan', hint: 'Propose only, no changes' },
]

/** A permission mode's short name. */
export function permissionLabel(mode: PermissionMode): string {
  return (
    PERMISSION_MODES.find((choice) => choice.value === mode)?.label ?? PERMISSION_MODES[0].label
  )
}
