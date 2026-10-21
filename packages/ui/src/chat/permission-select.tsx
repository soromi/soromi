import { PERMISSION_MODES, permissionLabel } from '@soromi/core'
import { ChevronDown, ShieldCheck } from 'lucide-react'

//Components
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '../components/ui/dropdown-menu'

//Types
import type { PermissionMode } from '@soromi/protocol'

/**
 * The composer's permission-mode picker: chooses whether the headless agent asks before running
 * tools (Ask), auto-accepts edits, bypasses entirely, or only plans. Applied live + persisted.
 */
export function PermissionSelect({
  mode,
  onChange,
}: {
  mode: PermissionMode
  onChange: (mode: PermissionMode) => void
}) {
  const label = permissionLabel(mode)
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          title="Tool permissions"
          className="flex cursor-pointer appearance-none items-center gap-1 rounded-lg border-none bg-transparent px-2 py-1 font-medium text-[12px] text-[var(--soromi-text-faint)] hover:bg-[var(--soromi-bg-hover)] hover:text-[var(--soromi-text-dim)]"
        >
          <ShieldCheck className="h-3.5 w-3.5" />
          {label}
          <ChevronDown className="h-3 w-3" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-56">
        {PERMISSION_MODES.map((option) => (
          <DropdownMenuItem
            key={option.value}
            onClick={() => onChange(option.value)}
            className="flex flex-col items-start gap-0.5"
          >
            <span className="text-[13px]">{option.label}</span>
            <span className="text-[11px] text-[var(--soromi-text-faint)]">{option.hint}</span>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
