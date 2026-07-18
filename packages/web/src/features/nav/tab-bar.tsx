import clsx from 'clsx'

//Store
import { useUiStore } from '@/stores/ui-store'

//Styles
import styles from './tab-bar.module.css'

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
    <nav className={styles.bar}>
      {TABS.map((item) => (
        <button
          key={item.key}
          type="button"
          className={clsx(styles.tab, item.key === tab && styles.active)}
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
          <span className={styles.label}>{item.label}</span>
        </button>
      ))}
    </nav>
  )
}
