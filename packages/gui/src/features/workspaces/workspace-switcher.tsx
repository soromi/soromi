import { Menu } from '@mantine/core'
import clsx from 'clsx'
import { useEffect, useMemo } from 'react'
import { useShallow } from 'zustand/react/shallow'

//Packages
import { useClientStore, useTransport } from '@soromi/client'
import { DragHandle, useReorder } from '@soromi/ui'

//Store
import { useAppStore } from '@/stores/app-store'

//Utils
import { modLabel } from '@/lib/platform'
import { statusLabel, statusTone } from './status'

//Icons
import CaretSvg from '@/assets/icons/caret.svg?react'
import CheckSvg from '@/assets/icons/check.svg?react'
import PlusSvg from '@/assets/icons/plus.svg?react'

//Styles
import styles from './workspace-switcher.module.css'

const abbreviate = (name: string) => name.slice(0, 2).replace(/^./, (c) => c.toUpperCase())

/**
 * The workspace switcher: a button showing the current workspace with an activity dot and a
 * busy-tab count, and a dropdown listing every workspace with its status ("Running…", "Finished ·
 * needs review", "Active now"). Finished-but-unseen workspaces surface a "View" affordance.
 */
export function WorkspaceSwitcher() {
  const transport = useTransport()
  const workspaces = useClientStore((s) => s.workspaces)
  const { active, needsReview, select, applyStatuses, openCreateSpace, openWorkspaceSettings } =
    useAppStore(
      useShallow((s) => ({
        active: s.active,
        needsReview: s.needsReview,
        select: s.select,
        applyStatuses: s.applyStatuses,
        openCreateSpace: s.openCreateSpace,
        openWorkspaceSettings: s.openWorkspaceSettings,
      })),
    )

  // Keep "needs review" in sync as the daemon reports status changes.
  useEffect(() => applyStatuses(workspaces), [workspaces, applyStatuses])

  const current = workspaces.find((w) => w.name === active)
  const currentTone = current ? statusTone(current.status) : 'idle'
  const finishedCount = workspaces.filter((w) => needsReview[w.name]).length

  // Other workspaces (not the one you're viewing) that want a look: running, waiting/blocked, or
  // finished-and-unseen. Shown as a badge on the collapsed button so it is visible without opening.
  const attention = useMemo(() => {
    const others = workspaces.filter(
      (w) => w.name !== active && (needsReview[w.name] || statusTone(w.status) !== 'idle'),
    )
    const urgent = others.some((w) => ['running', 'attention'].includes(statusTone(w.status)))

    return { count: others.length, tone: urgent ? 'attention' : 'finished' }
  }, [workspaces, active, needsReview])

  // Drag-to-reorder: the daemon persists the new order and broadcasts it back to every viewport.
  const { ordered, dragging, dragHandle, rowAttrs } = useReorder(
    workspaces,
    (w) => w.name,
    (order) => transport.send({ type: 'reorder-spaces', order }),
  )

  // Prepare each row's view data once, so the map below only renders (no per-item logic).
  const rows = useMemo(
    () =>
      ordered.map((workspace, index) => {
        const isActive = workspace.name === active
        const review = Boolean(needsReview[workspace.name])
        const rawTone = statusTone(workspace.status)

        return {
          name: workspace.name,
          avatar: abbreviate(workspace.name),
          isActive,
          review,
          tone: isActive ? 'active' : review ? 'finished' : rawTone,
          // Idle, unselected workspaces show just their name, no status line.
          showStatus: isActive || review || rawTone !== 'idle',
          label: statusLabel(workspace.status, isActive, review),
          // Slack-style jump hint (⌘1..9 / Ctrl+1..9) for the first nine.
          shortcut: index < 9 ? `${modLabel}${index + 1}` : undefined,
        }
      }),
    [ordered, active, needsReview],
  )

  return (
    <Menu position="bottom-start" width={288} withinPortal disabled={!active}>
      <Menu.Target>
        <button type="button" className={styles.switcher}>
          {active && (
            <span className={styles.avatarWrap}>
              <span className={styles.avatar}>{abbreviate(active)}</span>
              {currentTone !== 'idle' && (
                <span className={clsx(styles.avatarDot, styles[currentTone])} />
              )}
            </span>
          )}
          <span className={styles.name}>{active ?? 'No workspace'}</span>
          {attention.count > 0 && (
            <span className={styles.countPill}>
              <span className={clsx(styles.dot, styles[attention.tone])} />
              {attention.count}
            </span>
          )}
          <CaretSvg width={14} height={14} className={styles.caret} />
        </button>
      </Menu.Target>

      <Menu.Dropdown>
        <div className={styles.head}>
          <span className={styles.headLabel}>Workspaces</span>
          {finishedCount > 0 && (
            <span className={styles.headCount}>
              <span className={clsx(styles.dot, styles.finished)} />
              {finishedCount} finished
            </span>
          )}
        </div>

        {rows.map((row) => (
          <Menu.Item
            key={row.name}
            {...rowAttrs(row.name)}
            className={clsx(
              styles.row,
              row.isActive && styles.rowActive,
              dragging === row.name && styles.dragging,
            )}
            leftSection={
              <span className={styles.rowLead}>
                <DragHandle {...dragHandle(row.name)} />
                <span className={styles.rowAvatar}>{row.avatar}</span>
              </span>
            }
            rightSection={
              row.isActive ? (
                <CheckSvg width={15} height={15} className={styles.check} />
              ) : row.review ? (
                <span className={styles.view}>View</span>
              ) : row.shortcut ? (
                <span className={styles.shortcut}>{row.shortcut}</span>
              ) : undefined
            }
            onClick={() => select(row.name)}
          >
            <span className={styles.rowText}>
              <span className={styles.rowName}>{row.name}</span>
              {row.showStatus && (
                <span className={clsx(styles.rowStatus, styles[row.tone])}>
                  <span className={clsx(styles.dot, styles[row.tone])} />
                  {row.label}
                </span>
              )}
            </span>
          </Menu.Item>
        ))}

        <Menu.Divider />
        <Menu.Item
          leftSection={
            <span className={styles.newBox}>
              <PlusSvg width={12} height={12} />
            </span>
          }
          onClick={openCreateSpace}
        >
          New workspace…
        </Menu.Item>
        {active && (
          <Menu.Item onClick={() => openWorkspaceSettings(active)}>Workspace settings</Menu.Item>
        )}
      </Menu.Dropdown>
    </Menu>
  )
}
