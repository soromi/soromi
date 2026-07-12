import clsx from 'clsx'

//Packages
import { useClientStore } from '@soromi/client'

//Store
import { useUiStore } from '@/stores/ui-store'

//Utils
import { statusVariant } from '@/lib/status'

//Styles
import drawer from './drawer.module.css'
import styles from './workspaces-drawer.module.css'

/** Slide-over list of workspaces (the phone's equivalent of the desktop rail). */
export function WorkspacesDrawer() {
  const workspaces = useClientStore((s) => s.workspaces)
  const active = useUiStore((s) => s.active)
  const select = useUiStore((s) => s.select)
  const closeDrawer = useUiStore((s) => s.popOverlay)

  return (
    <>
      {/** biome-ignore lint/a11y/noStaticElementInteractions: click-away backdrop. */}
      {/** biome-ignore lint/a11y/useKeyWithClickEvents: click-away backdrop. */}
      <div className={drawer.backdrop} onClick={closeDrawer} />
      <aside className={clsx(drawer.panel, drawer.left)}>
        <div className={drawer.header}>
          <span className={drawer.title}>Workspaces</span>
          <button type="button" className={drawer.close} onClick={closeDrawer} aria-label="Close">
            ✕
          </button>
        </div>
        <div className={drawer.body}>
          {workspaces.map((workspace) => (
            <button
              key={workspace.name}
              type="button"
              className={clsx(styles.row, workspace.name === active && styles.active)}
              onClick={() => select(workspace.name)}
            >
              <span className={styles.avatar}>{workspace.name.charAt(0).toUpperCase()}</span>
              <span className={styles.name}>{workspace.name}</span>
              <span className={clsx(styles.dot, styles[statusVariant(workspace.status)])} />
            </button>
          ))}
          <button type="button" className={styles.add}>
            + New workspace
          </button>
        </div>
      </aside>
    </>
  )
}
