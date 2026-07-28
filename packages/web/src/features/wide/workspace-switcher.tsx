import { useMemo, useState } from 'react'
import { useShallow } from 'zustand/react/shallow'

//Packages
import { useClientStore, useTransport } from '@soromi/client'
import {
  DragHandle,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
  cn,
  useReorder,
} from '@soromi/ui'

//Store
import { useUiStore } from '@/stores/ui-store'

//Utils
import { statusLabel, statusTone } from '@/lib/status'

const abbreviate = (name: string) => name.slice(0, 2).replace(/^./, (c) => c.toUpperCase())

/** A status dot: base shape plus a tone background. */
const DOT = 'h-[7px] w-[7px] flex-none rounded-full'
const DOT_TONE: Record<string, string> = {
  running: 'bg-[var(--soromi-warn)]',
  attention: 'bg-[var(--soromi-warn)]',
  finished: 'bg-[var(--soromi-ok)]',
  idle: 'bg-[var(--soromi-text-faint)]',
  active: 'bg-[var(--soromi-text-faint)]',
}

/** Tone text color for a row's status line (base is faint; running / finished recolor it). */
const ROW_STATUS_TONE: Record<string, string> = {
  running: 'text-[var(--soromi-warn)]',
  attention: 'text-[var(--soromi-warn)]',
  finished: 'text-[var(--soromi-ok)]',
  idle: '',
  active: '',
}

/** A small square avatar tile (workspace initials). */
const AVATAR =
  'flex h-[30px] w-[30px] items-center justify-center rounded-lg bg-[var(--soromi-accent)] font-bold text-[var(--soromi-accent-on)] text-xs'

/** The sidebar header's workspace switcher: current workspace + a dropdown to jump between them. */
export function WorkspaceSwitcher() {
  const transport = useTransport()
  const workspaces = useClientStore((s) => s.workspaces)
  const { active, select } = useUiStore(useShallow((s) => ({ active: s.active, select: s.select })))
  const [open, setOpen] = useState(false)

  const current = workspaces.find((w) => w.name === active)
  const currentTone = current ? statusTone(current.status) : 'idle'

  const { ordered, dragging, dragHandle, rowAttrs } = useReorder(
    workspaces,
    (w) => w.name,
    (order) => transport.send({ type: 'reorder-spaces', order }),
  )

  const rows = useMemo(
    () =>
      ordered.map((workspace) => {
        const isActive = workspace.name === active
        const tone = statusTone(workspace.status)

        return {
          name: workspace.name,
          avatar: abbreviate(workspace.name),
          isActive,
          tone,
          showStatus: tone !== 'idle',
          label: statusLabel(workspace.status),
        }
      }),
    [ordered, active],
  )

  // `appearance-none` resets WebKit's native button chrome; the transparent border keeps rows the
  // same height whether or not the active one colors its border.
  const rowClass =
    'flex w-full appearance-none items-center gap-2.5 rounded-md border border-transparent bg-transparent px-2.5 py-2 text-left text-foreground hover:bg-muted'

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild disabled={!active}>
        <button
          type="button"
          className="flex w-full min-w-0 cursor-pointer appearance-none items-center gap-[9px] rounded-[10px] border-none bg-transparent px-2 py-1.5 text-[var(--soromi-text)] hover:bg-[var(--soromi-bg-hover)]"
        >
          <span className="relative flex-none">
            <span className={AVATAR}>{active ? abbreviate(active) : 'So'}</span>
            {currentTone !== 'idle' && (
              <span
                className={cn(
                  'absolute top-[-3px] right-[-3px] h-[11px] w-[11px] rounded-full border-2 border-[var(--soromi-bg-sidebar)]',
                  DOT_TONE[currentTone],
                )}
              />
            )}
          </span>
          <span className="min-w-0 flex-1 overflow-hidden text-ellipsis whitespace-nowrap text-left font-semibold text-[15px]">
            {active ?? 'Soromi'}
          </span>
          <svg
            width="14"
            height="14"
            viewBox="0 0 20 20"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="flex-shrink-0 text-[var(--soromi-text-faint)]"
            aria-hidden="true"
          >
            <path d="M5 8l5 5 5-5" />
          </svg>
        </button>
      </DropdownMenuTrigger>

      <DropdownMenuContent align="start" className="w-[272px] space-y-0.5 p-1.5">
        <div className="flex items-center justify-between px-3 pt-1.5 pb-2">
          <span className="font-semibold text-[11px] text-[var(--soromi-text-faint)] uppercase tracking-[0.08em]">
            Workspaces
          </span>
        </div>

        {rows.map((row) => (
          <button
            key={row.name}
            type="button"
            {...rowAttrs(row.name)}
            className={cn(
              rowClass,
              dragging === row.name && 'bg-[var(--soromi-bg-hover)] opacity-60',
              row.isActive && 'border-[var(--soromi-border)] bg-[var(--soromi-bg-active)]',
            )}
            onClick={() => {
              select(row.name)
              setOpen(false)
            }}
          >
            <span className="flex items-center gap-1">
              <DragHandle {...dragHandle(row.name)} />
              <span className={AVATAR}>{row.avatar}</span>
            </span>
            <span className="flex min-w-0 flex-1 flex-col gap-0.5">
              <span className="overflow-hidden text-ellipsis whitespace-nowrap font-medium text-[var(--soromi-text)] text-sm">
                {row.name}
              </span>
              {row.showStatus && (
                <span
                  className={cn(
                    'inline-flex items-center gap-1.5 text-[var(--soromi-text-faint)] text-xs',
                    ROW_STATUS_TONE[row.tone],
                  )}
                >
                  <span className={cn(DOT, DOT_TONE[row.tone])} />
                  {row.label}
                </span>
              )}
            </span>
            {row.isActive && (
              <svg
                width="15"
                height="15"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.4"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="text-[var(--soromi-accent)]"
                aria-hidden="true"
              >
                <path d="M5 12l5 5L20 7" />
              </svg>
            )}
          </button>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
