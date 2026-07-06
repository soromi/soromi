import { Menu } from '@mantine/core'
import clsx from 'clsx'
import { useShallow } from 'zustand/react/shallow'

//Services
import { useTransport } from '@/services/transport/transport-context'

//Store
import { useAppStore } from '@/stores/app-store'

//Components
import { FileTree } from '@/features/files/file-tree'
import { SkillList } from '@/features/skills/skill-list'

//Icons
import BellOffSvg from '@/assets/icons/bell-off.svg?react'
import BellSvg from '@/assets/icons/bell.svg?react'
import CaretSvg from '@/assets/icons/caret.svg?react'
import CheckSvg from '@/assets/icons/check.svg?react'
import MugSvg from '@/assets/icons/mug.svg?react'
import PlusSvg from '@/assets/icons/plus.svg?react'

//Styles
import styles from './sidebar.module.css'

//Types
import type { KeepAwakeMode } from '@soromi/protocol'

const KEEP_AWAKE_MODES: { mode: KeepAwakeMode; label: string }[] = [
  { mode: 'off', label: 'Off' },
  { mode: 'working', label: 'While agent works' },
  { mode: 'always', label: 'Always on' },
]

/**
 * Contextual second column. The header holds the workspace switcher plus the notification and
 * keep-awake controls; below it is the section the rail selected (file tree or skills list).
 */
export function Sidebar() {
  const transport = useTransport()
  const {
    workspaces,
    active,
    sidebarMode,
    muted,
    keepAwake,
    keepAwakeMode,
    select,
    openCreateSpace,
    openWorkspaceSettings,
    setMuted,
    setKeepAwakeMode,
  } = useAppStore(
    useShallow((s) => ({
      workspaces: s.workspaces,
      active: s.active,
      sidebarMode: s.sidebarMode,
      muted: s.active ? (s.muted[s.active] ?? false) : false,
      keepAwake: s.keepAwake,
      keepAwakeMode: s.keepAwakeMode,
      select: s.select,
      openCreateSpace: s.openCreateSpace,
      openWorkspaceSettings: s.openWorkspaceSettings,
      setMuted: s.setMuted,
      setKeepAwakeMode: s.setKeepAwakeMode,
    })),
  )

  const toggleMute = () => {
    if (!active) return
    const next = !muted
    setMuted(active, next)
    transport.send({ type: 'mute-workspace', workspace: active, muted: next })
  }
  const selectKeepAwake = (mode: KeepAwakeMode) => {
    setKeepAwakeMode(mode)
    transport.send({ type: 'set-keep-awake-mode', mode })
  }

  return (
    <aside className={styles.sidebar}>
      <div className={styles.header}>
        <Menu position="bottom-start" width={230} withinPortal disabled={!active}>
          <Menu.Target>
            <button type="button" className={styles.switcher}>
              {active && <span className={styles.avatar}>{abbreviate(active)}</span>}
              <span className={styles.name}>{active ?? 'No workspace'}</span>
              <CaretSvg width={14} height={14} className={styles.caret} />
            </button>
          </Menu.Target>
          <Menu.Dropdown>
            <Menu.Label>Workspaces</Menu.Label>
            {workspaces.map((workspace) => (
              <Menu.Item
                key={workspace.name}
                leftSection={<span className={styles.avatarSm}>{abbreviate(workspace.name)}</span>}
                rightSection={
                  workspace.name === active ? <CheckSvg width={14} height={14} /> : undefined
                }
                onClick={() => select(workspace.name)}
              >
                {workspace.name}
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
              <>
                <Menu.Divider />
                <Menu.Item onClick={() => openWorkspaceSettings(active)}>
                  Workspace settings
                </Menu.Item>
              </>
            )}
          </Menu.Dropdown>
        </Menu>

        <span className={styles.spacer} />

        <button
          type="button"
          className={clsx(styles.action, !muted && styles.on)}
          onClick={toggleMute}
          disabled={!active}
          title={muted ? 'Notifications muted' : 'Notifications on'}
        >
          {muted ? <BellOffSvg width={16} height={16} /> : <BellSvg width={16} height={16} />}
        </button>
        <Menu position="bottom-end" width={200} withinPortal>
          <Menu.Target>
            <button
              type="button"
              className={clsx(styles.action, keepAwake && styles.on)}
              title={`Keep awake: ${KEEP_AWAKE_MODES.find((m) => m.mode === keepAwakeMode)?.label}`}
            >
              <MugSvg width={16} height={16} />
            </button>
          </Menu.Target>
          <Menu.Dropdown>
            <Menu.Label>Keep awake</Menu.Label>
            {KEEP_AWAKE_MODES.map(({ mode, label }) => (
              <Menu.Item
                key={mode}
                leftSection={
                  <CheckSvg
                    width={14}
                    height={14}
                    className={clsx(styles.check, mode === keepAwakeMode && styles.checkOn)}
                  />
                }
                onClick={() => selectKeepAwake(mode)}
              >
                {label}
              </Menu.Item>
            ))}
          </Menu.Dropdown>
        </Menu>
      </div>

      <div className={styles.body}>
        {active && (
          <>
            <div className={styles.sectionLabel}>{sidebarMode}</div>
            {sidebarMode === 'files' ? <FileTree /> : <SkillList />}
          </>
        )}
      </div>
    </aside>
  )
}

function abbreviate(name: string): string {
  return name.slice(0, 2).replace(/^./, (c) => c.toUpperCase())
}
