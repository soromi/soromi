import clsx from 'clsx'
import { useShallow } from 'zustand/react/shallow'

//Store
import { useAppStore } from '@/stores/app-store'

//Constants
import { statusVariant } from '@/config/theme'

//Icons
import SettingsSvg from '@/assets/icons/settings.svg?react'

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
        <SettingsSvg width={19} height={19} />
      </button>
    </nav>
  )
}

function abbreviate(name: string): string {
  return name.slice(0, 2).replace(/^./, (c) => c.toUpperCase())
}
