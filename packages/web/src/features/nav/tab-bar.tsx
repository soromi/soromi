//Packages
import { cn } from '@soromi/ui'

//Store
import { useUiStore } from '@/stores/ui-store'

//Types
import type { MobileTab } from '@/stores/ui-store'
import type { ReactNode } from 'react'

interface TabDef {
  key: MobileTab
  label: string
  icon: ReactNode
}

const TABS: TabDef[] = [
  {
    key: 'terminal',
    label: 'Terminal',
    icon: (
      <>
        <path d="M4 17l6-6-6-6" />
        <path d="M12 19h8" />
      </>
    ),
  },
  {
    key: 'files',
    label: 'Files',
    icon: <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />,
  },
  {
    key: 'skills',
    label: 'Skills',
    icon: (
      <>
        <path d="M12 3l1.9 4.6L18.5 9l-4.6 1.4L12 15l-1.9-4.6L5.5 9l4.6-1.4z" />
        <path d="M18 15l.8 2 2 .8-2 .8-.8 2-.8-2-2-.8 2-.8z" />
      </>
    ),
  },
]

/** The phone's bottom navigation: Terminal (the base) and the Files / Skills panels over it. */
export function TabBar() {
  const tab = useUiStore((s) => s.tab)
  const setTab = useUiStore((s) => s.setTab)

  return (
    <nav className="flex flex-none items-stretch justify-around border-[var(--soromi-border-subtle)] border-t bg-[var(--soromi-bg-rail)] px-1 pt-1.5 pb-[calc(6px+var(--safe-bottom))]">
      {TABS.map((item) => (
        <button
          key={item.key}
          type="button"
          className={cn(
            'flex flex-1 cursor-pointer appearance-none flex-col items-center gap-[3px] rounded-[10px] border-none bg-transparent pt-1.5 pb-1 text-[var(--soromi-text-faint)]',
            item.key === tab && 'text-[var(--soromi-accent)]',
          )}
          onClick={() => setTab(item.key)}
        >
          <svg
            width="22"
            height="22"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            {item.icon}
          </svg>
          <span className="font-semibold text-[10.5px]">{item.label}</span>
        </button>
      ))}
    </nav>
  )
}
