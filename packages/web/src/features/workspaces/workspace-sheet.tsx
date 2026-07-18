import clsx from 'clsx'
import { useShallow } from 'zustand/react/shallow'

//Packages
import { useClientStore } from '@soromi/client'

//Store
import { useUiStore } from '@/stores/ui-store'

//Utils
import { statusVariant } from '@/lib/status'

//Components
import { BottomSheet } from '@/shared/bottom-sheet'

//Styles
import styles from './workspace-sheet.module.css'

/** Bottom sheet to switch workspaces (the phone's equivalent of the desktop rail). */
export function WorkspaceSheet() {
  const workspaces = useClientStore((s) => s.workspaces)
  const { sheet, active, select, close } = useUiStore(
    useShallow((s) => ({
      sheet: s.sheet,
      active: s.active,
      select: s.select,
      close: s.closeSheet,
    })),
  )

  return (
    <BottomSheet opened={sheet === 'workspaces'} onClose={close} title="Workspaces">
      <div className={styles.list}>
        {workspaces.map((workspace) => (
          <button
            key={workspace.name}
            type="button"
            className={clsx(styles.row, workspace.name === active && styles.activeRow)}
            onClick={() => select(workspace.name)}
          >
            <span className={styles.avatar}>{workspace.name.slice(0, 2)}</span>
            <span className={styles.name}>{workspace.name}</span>
            <span className={clsx(styles.dot, styles[statusVariant(workspace.status)])} />
          </button>
        ))}
      </div>
    </BottomSheet>
  )
}
