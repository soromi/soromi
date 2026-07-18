import { Menu } from '@mantine/core'
import clsx from 'clsx'
import { useMemo } from 'react'
import { useShallow } from 'zustand/react/shallow'

//Packages
import { useClientStore } from '@soromi/client'

//Store
import { useUiStore } from '@/stores/ui-store'

//Utils
import { statusLabel, statusTone } from '@/lib/status'

//Styles
import styles from './workspace-switcher.module.css'

const abbreviate = (name: string) => name.slice(0, 2).replace(/^./, (c) => c.toUpperCase())

/** The sidebar header's workspace switcher: current workspace + a dropdown to jump between them. */
export function WorkspaceSwitcher() {
  const workspaces = useClientStore((s) => s.workspaces)
  const { active, select } = useUiStore(useShallow((s) => ({ active: s.active, select: s.select })))

  const current = workspaces.find((w) => w.name === active)
  const currentTone = current ? statusTone(current.status) : 'idle'

  const rows = useMemo(
    () =>
      workspaces.map((workspace) => {
        const isActive = workspace.name === active
        const tone = statusTone(workspace.status)

        return {
          name: workspace.name,
          avatar: abbreviate(workspace.name),
          isActive,
          tone: isActive ? 'active' : tone,
          showStatus: isActive || tone !== 'idle',
          label: statusLabel(workspace.status, isActive),
        }
      }),
    [workspaces, active],
  )

  return (
    <Menu position="bottom-start" width={272} disabled={!active}>
      <Menu.Target>
        <button type="button" className={styles.switcher}>
          <span className={styles.avatarWrap}>
            <span className={styles.avatar}>{active ? abbreviate(active) : 'So'}</span>
            {currentTone !== 'idle' && (
              <span className={clsx(styles.avatarDot, styles[currentTone])} />
            )}
          </span>
          <span className={styles.name}>{active ?? 'Soromi'}</span>
          <svg
            width="14"
            height="14"
            viewBox="0 0 20 20"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className={styles.caret}
            aria-hidden="true"
          >
            <path d="M5 8l5 5 5-5" />
          </svg>
        </button>
      </Menu.Target>

      <Menu.Dropdown>
        <div className={styles.head}>
          <span className={styles.headLabel}>Workspaces</span>
        </div>

        {rows.map((row) => (
          <Menu.Item
            key={row.name}
            leftSection={<span className={styles.rowAvatar}>{row.avatar}</span>}
            rightSection={
              row.isActive ? (
                <svg
                  width="15"
                  height="15"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.4"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className={styles.check}
                  aria-hidden="true"
                >
                  <path d="M5 12l5 5L20 7" />
                </svg>
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
      </Menu.Dropdown>
    </Menu>
  )
}
