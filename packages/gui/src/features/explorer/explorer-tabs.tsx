//Packages
import { cn } from '@soromi/ui'

//Icons
import FilesSvg from '@/assets/icons/files.svg?react'
import GitBranchSvg from '@/assets/icons/git-branch.svg?react'
import SkillsSvg from '@/assets/icons/skills.svg?react'
import TerminalSvg from '@/assets/icons/terminal.svg?react'

//Types
import type { SidebarMode } from '@/stores/app-store'

/** The Explorer's views, in the order they are offered. */
const TABS: { mode: SidebarMode; label: string; Icon: typeof FilesSvg }[] = [
  { mode: 'files', label: 'Files', Icon: FilesSvg },
  { mode: 'skills', label: 'Skills', Icon: SkillsSvg },
  { mode: 'git', label: 'Git', Icon: GitBranchSvg },
  { mode: 'terminal', label: 'Terminal', Icon: TerminalSvg },
]

/**
 * The Explorer's views as a row of icons. It is shown in two places: at the top of the Explorer,
 * where it switches between them, and in a session's header while the Explorer is closed, where
 * each icon opens it on that view. `active` marks the one on screen; none is, while it is closed.
 */
export function ExplorerTabs({
  active,
  onSelect,
}: {
  active: SidebarMode | null
  onSelect: (mode: SidebarMode) => void
}) {
  return (
    <div className="flex flex-none items-center gap-0.5">
      {TABS.map(({ mode, label, Icon }) => (
        <button
          key={mode}
          type="button"
          title={label}
          aria-label={label}
          aria-pressed={active === mode}
          onClick={() => onSelect(mode)}
          className={cn(
            'flex h-[28px] w-[28px] cursor-pointer appearance-none items-center justify-center rounded-lg border-none bg-transparent text-[var(--soromi-text-faint)] hover:bg-[var(--soromi-bg-hover)] hover:text-[var(--soromi-text-dim)]',
            active === mode &&
              'bg-[var(--soromi-accent-dim)] text-[var(--soromi-accent)] hover:bg-[var(--soromi-accent-dim)] hover:text-[var(--soromi-accent)]',
          )}
        >
          <Icon width={15} height={15} />
        </button>
      ))}
    </div>
  )
}
