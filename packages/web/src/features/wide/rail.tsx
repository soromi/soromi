import { useShallow } from 'zustand/react/shallow'

//Packages
import { cn } from '@soromi/ui'

//Store
import { useUiStore } from '@/stores/ui-store'

//Types
import type { ReactNode } from 'react'
import type { SidebarMode } from '@/stores/ui-store'

/** A rail section toggle. */
const SECTION =
  'relative flex h-11 w-11 cursor-pointer appearance-none items-center justify-center rounded-xl border-none bg-transparent text-[var(--soromi-text-faint)] transition-colors enabled:hover:bg-[var(--soromi-bg-hover)] enabled:hover:text-[var(--soromi-text-dim)] disabled:cursor-default disabled:opacity-40'

/** Selected section: accent tint, ring, and the green left-edge indicator; holds on hover. */
const SECTION_ACTIVE =
  "bg-[var(--soromi-accent-dim)] text-[var(--soromi-accent)] shadow-[inset_0_0_0_1px_var(--soromi-accent-border)] enabled:hover:bg-[var(--soromi-accent-dim)] enabled:hover:text-[var(--soromi-accent)] before:absolute before:top-[9px] before:bottom-[9px] before:left-[-10px] before:w-[3px] before:rounded-[0_3px_3px_0] before:bg-[var(--soromi-accent)] before:content-['']"

interface Section {
  mode: SidebarMode
  label: string
  icon: ReactNode
}

const SECTIONS: Section[] = [
  {
    mode: 'files',
    label: 'Files',
    icon: <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />,
  },
  {
    mode: 'skills',
    label: 'Skills',
    icon: <path d="M12 3l1.9 4.6L18.5 9l-4.6 1.4L12 15l-1.9-4.6L5.5 9l4.6-1.4z" />,
  },
]

/** The wide layout's far-left icon nav: the app mark, then the sidebar section toggles. */
export function Rail() {
  const { active, sidebarMode, setSidebarMode } = useUiStore(
    useShallow((s) => ({
      active: s.active,
      sidebarMode: s.sidebarMode,
      setSidebarMode: s.setSidebarMode,
    })),
  )

  return (
    <div className="flex w-16 flex-shrink-0 flex-col items-center gap-3 border-[var(--soromi-border)] border-r bg-[var(--soromi-bg-rail)] py-3.5">
      <div
        className="mb-3 flex h-11 w-11 items-center justify-center rounded-[13px] bg-[#efece1]"
        aria-hidden="true"
      >
        <svg width="20" height="18" viewBox="0 0 22 20" aria-hidden="true">
          <rect x="0" y="1" width="22" height="4.4" rx="2.2" fill="#2fae6a" />
          <rect x="0" y="7.8" width="14" height="4.4" rx="2.2" fill="#2fae6a" />
          <rect x="0" y="14.6" width="18" height="4.4" rx="2.2" fill="#2fae6a" />
        </svg>
      </div>

      <div className="flex flex-col items-center gap-2">
        {SECTIONS.map((section) => (
          <button
            key={section.mode}
            type="button"
            className={cn(SECTION, active && sidebarMode === section.mode && SECTION_ACTIVE)}
            onClick={() => setSidebarMode(section.mode)}
            disabled={!active}
            title={section.label}
          >
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              {section.icon}
            </svg>
          </button>
        ))}
      </div>
    </div>
  )
}
