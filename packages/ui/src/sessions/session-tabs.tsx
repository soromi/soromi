import clsx from 'clsx'
import { useState } from 'react'

//Styles
import styles from './session-tabs.module.css'

//Types
import type { Status } from '@soromi/protocol'
import type { ReactNode } from 'react'

/** Maps an agent status to its dot class; idle has no dot. */
const STATUS_CLASS: Record<Status, string | null> = {
  thinking: styles.thinking,
  'waiting-input': styles.waiting,
  blocked: styles.blocked,
  done: styles.done,
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
}: SessionTabsProps) {
  return (
    <div className={styles.tabBar}>
      <div className={styles.tabs}>
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
    <div className={clsx(styles.tab, active && styles.tabActive)}>
      {editing ? (
        <input
          // biome-ignore lint/a11y/noAutofocus: focus the field the user just opened to rename.
          autoFocus
          className={styles.tabInput}
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
          className={styles.tabMain}
          onClick={onSelect}
          onDoubleClick={startEdit}
          title={onRename ? 'Double-click to rename' : tab.label}
        >
          {icon}
          <span className={styles.tabLabel}>{tab.label}</span>
          {dot && <span className={clsx(styles.tabDot, dot)} />}
        </button>
      )}
      {onClose && !editing && (
        <button type="button" className={styles.tabClose} title="Close session" onClick={onClose}>
          ✕
        </button>
      )}
    </div>
  )
}
