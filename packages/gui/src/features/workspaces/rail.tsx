import clsx from 'clsx'
import { useShallow } from 'zustand/react/shallow'

//Store
import { useAppStore } from '@/stores/app-store'

//Constants
import { statusVariant } from '@/config/theme'

//Styles
import styles from './rail.module.css'

/** The far-left workspace switcher: one icon per workspace, plus an add button. */
export function Rail() {
  const { workspaces, active, select, openCreateSpace, openSettings } = useAppStore(
    useShallow((s) => ({
      workspaces: s.workspaces,
      active: s.active,
      select: s.select,
      openCreateSpace: s.openCreateSpace,
      openSettings: s.openSettings,
    })),
  )

  return (
    <nav className={styles.rail}>
      {workspaces.map((workspace) => (
        <button
          key={workspace.name}
          type="button"
          className={clsx(styles.icon, workspace.name === active && styles.active)}
          title={`${workspace.name} — ${workspace.status}`}
          onClick={() => select(workspace.name)}
        >
          {abbreviate(workspace.name)}
          {workspace.status !== 'idle' && (
            <span className={clsx(styles.dot, styles[statusVariant(workspace.status)])} />
          )}
        </button>
      ))}
      <button type="button" className={styles.add} title="Add workspace" onClick={openCreateSpace}>
        +
      </button>
      <span className={styles.spacer} />
      <button type="button" className={styles.gear} title="Settings" onClick={openSettings}>
        <GearIcon />
      </button>
    </nav>
  )
}

function abbreviate(name: string): string {
  return name.slice(0, 2).replace(/^./, (c) => c.toUpperCase())
}

function GearIcon() {
  return (
    <svg
      width={19}
      height={19}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.7}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="3" />
      <path d="M19 12a7 7 0 0 0-.1-1.2l2-1.5-2-3.5-2.4 1a7 7 0 0 0-2-1.2L14 3h-4l-.5 2.6a7 7 0 0 0-2 1.2l-2.4-1-2 3.5 2 1.5a7 7 0 0 0 0 2.4l-2 1.5 2 3.5 2.4-1a7 7 0 0 0 2 1.2L10 21h4l.5-2.6a7 7 0 0 0 2-1.2l2.4 1 2-3.5-2-1.5c.07-.4.1-.8.1-1.2Z" />
    </svg>
  )
}
