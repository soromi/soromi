import clsx from 'clsx'

//Packages
import { useClientStore } from '@soromi/client'

//Store
import { useUiStore } from '@/stores/ui-store'

//Styles
import styles from './top-bar.module.css'

/** The mobile top bar: open the workspaces drawer, show connection state, open the sidebar. */
export function TopBar() {
  const active = useUiStore((s) => s.active)
  const openWorkspaces = useUiStore((s) => s.openWorkspaces)
  const openSidebar = useUiStore((s) => s.openSidebar)
  const connected = useClientStore((s) => s.connected)

  return (
    <header className={styles.bar}>
      <button
        type="button"
        className={styles.switcher}
        onClick={openWorkspaces}
        aria-label="Switch workspace"
      >
        <span className={styles.avatar}>{(active ?? 'S').charAt(0).toUpperCase()}</span>
        <span className={styles.name}>{active ?? 'Soromi'}</span>
        <span className={styles.caret}>▾</span>
      </button>

      <div className={styles.spacer} />

      <span
        className={clsx(styles.dot, connected ? styles.dotOn : styles.dotOff)}
        title={connected ? 'Connected' : 'Disconnected'}
      />
      <button
        type="button"
        className={styles.menu}
        onClick={openSidebar}
        aria-label="Files and skills"
      >
        ☰
      </button>
    </header>
  )
}
