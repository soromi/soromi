import clsx from 'clsx'
import { useShallow } from 'zustand/react/shallow'

//Store
import { useUiStore } from '@/stores/ui-store'

//Styles
import styles from './rail.module.css'

//Types
import type { ReactNode } from 'react'
import type { SidebarMode } from '@/stores/ui-store'

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
    <div className={styles.rail}>
      <div className={styles.logo} aria-hidden="true">
        <svg width="20" height="18" viewBox="0 0 22 20" aria-hidden="true">
          <rect x="0" y="1" width="22" height="4.4" rx="2.2" fill="#2fae6a" />
          <rect x="0" y="7.8" width="14" height="4.4" rx="2.2" fill="#2fae6a" />
          <rect x="0" y="14.6" width="18" height="4.4" rx="2.2" fill="#2fae6a" />
        </svg>
      </div>

      <div className={styles.sections}>
        {SECTIONS.map((section) => (
          <button
            key={section.mode}
            type="button"
            className={clsx(
              styles.section,
              active && sidebarMode === section.mode && styles.active,
            )}
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
