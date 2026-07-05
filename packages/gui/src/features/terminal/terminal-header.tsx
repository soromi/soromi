import { Menu } from '@mantine/core'
import clsx from 'clsx'
import { useShallow } from 'zustand/react/shallow'

//Services
import { useTransport } from '@/services/transport/transport-context'

//Store
import { useAppStore } from '@/stores/app-store'

//Constants
import { accountKind, statusVariant } from '@/config/theme'

//Icons
import BellOffSvg from '@/assets/icons/bell-off.svg?react'
import BellSvg from '@/assets/icons/bell.svg?react'
import CheckSvg from '@/assets/icons/check.svg?react'
import GearSvg from '@/assets/icons/gear.svg?react'
import MugSvg from '@/assets/icons/mug.svg?react'

//Styles
import styles from './terminal-header.module.css'

//Types
import type { KeepAwakeMode } from '@soromi/protocol'

const KEEP_AWAKE_MODES: { mode: KeepAwakeMode; label: string }[] = [
  { mode: 'off', label: 'Off' },
  { mode: 'working', label: 'While agent works' },
  { mode: 'always', label: 'Always on' },
]

/** Header bar above the terminal: status, workspace, agent, account, and actions. */
export function TerminalHeader() {
  const transport = useTransport()
  const {
    workspace,
    muted,
    keepAwake,
    keepAwakeMode,
    setMuted,
    setKeepAwakeMode,
    openWorkspaceSettings,
  } = useAppStore(
    useShallow((s) => ({
      workspace: s.workspaces.find((w) => w.name === s.active),
      muted: s.active ? (s.muted[s.active] ?? false) : false,
      keepAwake: s.keepAwake,
      keepAwakeMode: s.keepAwakeMode,
      setMuted: s.setMuted,
      setKeepAwakeMode: s.setKeepAwakeMode,
      openWorkspaceSettings: s.openWorkspaceSettings,
    })),
  )
  if (!workspace) return null

  const name = workspace.name
  const toggleMute = () => {
    const next = !muted
    setMuted(name, next)
    transport.send({ type: 'mute-workspace', workspace: name, muted: next })
  }
  const selectKeepAwake = (mode: KeepAwakeMode) => {
    setKeepAwakeMode(mode)
    transport.send({ type: 'set-keep-awake-mode', mode })
  }

  return (
    <header className={styles.header}>
      <span
        className={clsx(styles.dot, styles[statusVariant(workspace.status)])}
        title={workspace.status}
      />
      <span className={styles.name}>{name}</span>
      <span className={styles.agent}>{workspace.agent}</span>
      <span className={clsx(styles.badge, styles[accountKind(workspace.account)])}>
        {workspace.account}
      </span>
      <span className={styles.spacer} />
      <button
        type="button"
        className={clsx(styles.action, !muted && styles.on)}
        onClick={toggleMute}
        title={muted ? 'Notifications muted' : 'Notifications on'}
      >
        {muted ? <BellOffSvg width={16} height={16} /> : <BellSvg width={16} height={16} />}
      </button>
      <Menu position="bottom-end" width={200}>
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
      <button
        type="button"
        className={styles.action}
        onClick={() => openWorkspaceSettings(name)}
        title="Workspace settings"
      >
        <GearSvg width={16} height={16} />
      </button>
    </header>
  )
}
