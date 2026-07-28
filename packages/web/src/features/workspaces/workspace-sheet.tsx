import { useShallow } from 'zustand/react/shallow'

//Packages
import { useClientStore, useTransport } from '@soromi/client'
import { DragHandle, cn, useReorder } from '@soromi/ui'

//Store
import { useUiStore } from '@/stores/ui-store'

//Utils
import { statusVariant } from '@/lib/status'

//Components
import { BottomSheet } from '@/shared/bottom-sheet'

/** Status-dot color per session variant. */
const DOT_TONE: Record<string, string> = {
  thinking: 'bg-[var(--soromi-accent)]',
  waiting: 'bg-[var(--soromi-warn)]',
  blocked: 'bg-[#f87171]',
  done: 'bg-[var(--soromi-ok)]',
  idle: 'bg-[var(--soromi-text-faint)]',
}

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
      <div className="flex flex-col gap-0.5 pb-2">
        {ordered.map((workspace) => (
          <div
            key={workspace.name}
            {...rowAttrs(workspace.name)}
            className={cn(
              'flex w-full items-center gap-2 rounded-[11px] px-2.5 py-2 text-[var(--soromi-text)]',
              workspace.name === active && 'bg-[var(--soromi-bg-active)]',
              dragging === workspace.name && 'bg-[var(--soromi-bg-hover)] opacity-60',
            )}
          >
            <DragHandle {...dragHandle(workspace.name)} />
            {/** biome-ignore lint/a11y/useKeyWithClickEvents: adjacent drag handle; row is a simple tap target. */}
            {/** biome-ignore lint/a11y/noStaticElementInteractions: tap-to-select workspace. */}
            <span
              className="flex min-w-0 flex-1 cursor-pointer items-center gap-3 py-1"
              onClick={() => select(workspace.name)}
            >
              <span className="flex h-[34px] w-[34px] flex-shrink-0 items-center justify-center rounded-[9px] bg-[var(--soromi-accent)] font-bold text-[13px] text-[var(--soromi-accent-on)] capitalize">
                {workspace.name.slice(0, 2)}
              </span>
              <span className="flex-1 overflow-hidden text-ellipsis whitespace-nowrap text-left font-medium text-[15px]">
                {workspace.name}
              </span>
              <span
                className={cn(
                  'h-[9px] w-[9px] flex-shrink-0 rounded-full',
                  DOT_TONE[statusVariant(workspace.status)],
                )}
              />
            </span>
          </div>
        ))}
      </div>
    </BottomSheet>
  )
}
