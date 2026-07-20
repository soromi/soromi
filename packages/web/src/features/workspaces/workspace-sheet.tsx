import clsx from 'clsx'
import { useShallow } from 'zustand/react/shallow'

//Packages
import { useClientStore, useTransport } from '@soromi/client'
import { DragHandle, useReorder } from '@soromi/ui'

//Store
import { useUiStore } from '@/stores/ui-store'

//Utils
import { statusVariant } from '@/lib/status'

//Components
import { BottomSheet } from '@/shared/bottom-sheet'

//Styles
import styles from './workspace-sheet.module.css'

/** Bottom sheet to switch workspaces (the phone's equivalent of the desktop rail). Drag to reorder. */
export function WorkspaceSheet() {
  const transport = useTransport()
  const workspaces = useClientStore((s) => s.workspaces)
  const { sheet, active, select, close } = useUiStore(
    useShallow((s) => ({
      sheet: s.sheet,
      active: s.active,
      select: s.select,
      close: s.closeSheet,
    })),
  )

  const { ordered, dragging, dragHandle, rowAttrs } = useReorder(
    workspaces,
    (w) => w.name,
    (order) => transport.send({ type: 'reorder-spaces', order }),
  )

  return (
    <BottomSheet opened={sheet === 'workspaces'} onClose={close} title="Workspaces">
      <div className={styles.list}>
        {ordered.map((workspace) => (
          <div
            key={workspace.name}
            {...rowAttrs(workspace.name)}
            className={clsx(
              styles.row,
              workspace.name === active && styles.activeRow,
              dragging === workspace.name && styles.dragging,
            )}
          >
            <DragHandle {...dragHandle(workspace.name)} />
            {/** biome-ignore lint/a11y/useKeyWithClickEvents: adjacent drag handle; row is a simple tap target. */}
            {/** biome-ignore lint/a11y/noStaticElementInteractions: tap-to-select workspace. */}
            <span className={styles.tap} onClick={() => select(workspace.name)}>
              <span className={styles.avatar}>{workspace.name.slice(0, 2)}</span>
              <span className={styles.name}>{workspace.name}</span>
              <span className={clsx(styles.dot, styles[statusVariant(workspace.status)])} />
            </span>
          </div>
        ))}
      </div>
    </BottomSheet>
  )
}
