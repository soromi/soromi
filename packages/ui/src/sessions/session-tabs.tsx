import { useState } from 'react'

//Utils
import { cn } from '../lib/utils'

//Types
import type { Status } from '@soromi/protocol'
import type { ReactNode } from 'react'

/** Maps an agent status to its dot color class; idle has no dot. */
const STATUS_CLASS: Record<Status, string | null> = {
  thinking: 'bg-[var(--soromi-accent)]',
  'waiting-input': 'bg-[var(--soromi-warn)]',
  blocked: 'bg-[#f87171]',
  done: 'bg-[var(--soromi-ok)]',
  idle: null,
}

export interface SessionTab {
  id: string
  /** The display label (already resolved: custom title, or account, de-duplicated by the host). */
  label: string
  status: Status
  agent: string
  /** The custom title, if any, seeded into the rename field. */
  title: string | null
  /** Fallback shown as the rename placeholder when there is no title. */
  account: string
  canClose: boolean
}

export interface SessionTabsProps {
  tabs: SessionTab[]
  activeId?: string
  onSelect: (id: string) => void
  /** Enables double-click inline rename when provided. */
  onRename?: (id: string, title: string) => void
  onClose?: (id: string) => void
  /** Host-supplied agent icon (desktop provider glyph); omitted where there is none. */
  renderIcon?: (agent: string) => ReactNode
  /** Host-supplied new-session control, placed after the tabs (e.g. a provider menu). */
  trailing?: ReactNode
  /** Host-supplied control pinned to the far right of the bar (e.g. the desktop Explorer toggle). */
  rightSlot?: ReactNode
}

/**
 * Presentational session tab strip: labels, status dots, optional inline rename and close, plus a
 * host-provided icon and new-session slot. All data and actions come from the host, so desktop and
 * web render the same strip.
 */
export function SessionTabs({
  tabs,
  activeId,
  onSelect,
  onRename,
  onClose,
  renderIcon,
  trailing,
  rightSlot,
}: SessionTabsProps) {
  return (
    <div className="flex min-h-[40px] items-stretch border-[var(--soromi-border)] border-b bg-[var(--soromi-bg-tab)]">
      <div className="flex min-w-0 flex-1 items-stretch overflow-x-auto">
        {tabs.map((tab) => (
          <Tab
            key={tab.id}
            tab={tab}
            active={tab.id === activeId}
            onSelect={() => onSelect(tab.id)}
            onRename={onRename ? (title) => onRename(tab.id, title) : undefined}
            onClose={onClose && tab.canClose ? () => onClose(tab.id) : undefined}
            icon={renderIcon?.(tab.agent)}
          />
        ))}
        {trailing}
      </div>
      {rightSlot && <div className="flex flex-none items-center">{rightSlot}</div>}
    </div>
  )
}

function Tab({
  tab,
  active,
  onSelect,
  onRename,
  onClose,
  icon,
}: {
  tab: SessionTab
  active: boolean
  onSelect: () => void
  onRename?: (title: string) => void
  onClose?: () => void
  icon?: ReactNode
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState('')

  const startEdit = () => {
    if (!onRename) return
    setDraft(tab.title ?? '')
    setEditing(true)
  }
  const commit = () => {
    setEditing(false)
    onRename?.(draft.trim())
  }

  const dot = STATUS_CLASS[tab.status]

  return (
    <div
      className={cn(
        'group relative flex items-center border-[var(--soromi-border)] border-r bg-transparent text-[var(--soromi-text-dim)] hover:bg-[var(--soromi-bg-hover)]',
        // The accent bar along the top of the active tab; keep its background on hover too.
        active &&
          'bg-[var(--soromi-bg-terminal)] text-[var(--soromi-text)] shadow-[inset_0_2px_0_var(--soromi-accent)] hover:bg-[var(--soromi-bg-terminal)]',
      )}
    >
      {editing ? (
        <input
          // biome-ignore lint/a11y/noAutofocus: focus the field the user just opened to rename.
          autoFocus
          className="mx-1.5 my-1 w-[120px] rounded border border-[var(--soromi-border)] bg-[var(--soromi-bg-terminal)] px-1 py-0.5 font-[inherit] text-[var(--soromi-text)] text-xs focus:border-[var(--soromi-accent)] focus:outline-none"
          value={draft}
          placeholder={tab.account}
          onChange={(event) => setDraft(event.currentTarget.value)}
          onBlur={commit}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault()
              commit()
            } else if (event.key === 'Escape') {
              setEditing(false)
            }
          }}
        />
      ) : (
        <button
          type="button"
          className="flex h-[40px] min-w-[128px] max-w-[230px] cursor-pointer appearance-none items-center gap-[9px] border-none bg-transparent pr-2.5 pl-4 text-[13.5px] text-inherit"
          onClick={onSelect}
          onDoubleClick={startEdit}
          title={onRename ? 'Double-click to rename' : tab.label}
        >
          {icon}
          <span className="overflow-hidden text-ellipsis whitespace-nowrap">{tab.label}</span>
          {dot && <span className={cn('ml-auto h-[7px] w-[7px] flex-none rounded-full', dot)} />}
        </button>
      )}
      {onClose && !editing && (
        <button
          type="button"
          className={cn(
            'mr-1.5 flex h-[18px] w-[18px] cursor-pointer appearance-none items-center justify-center rounded border-none bg-transparent p-0 text-[var(--soromi-text-faint)] text-xs opacity-0 hover:bg-[var(--soromi-bg-hover)] hover:text-[var(--soromi-text)] group-hover:opacity-100',
            active && 'opacity-100',
          )}
          title="Close session"
          onClick={onClose}
        >
          ✕
        </button>
      )}
    </div>
  )
}
