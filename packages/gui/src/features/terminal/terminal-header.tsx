import { Menu, Text } from '@mantine/core'
import { modals } from '@mantine/modals'
import clsx from 'clsx'
import { useShallow } from 'zustand/react/shallow'

//Services
import { useTransport } from '@/services/transport/transport-context'

//Store
import { useAppStore } from '@/stores/app-store'

//Constants
import { accountKind, statusVariant } from '@/config/theme'

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
  const exportSpace = () => {
    transport.send({ type: 'export-space', workspace: name })
  }
  const removeSpace = () => {
    modals.openConfirmModal({
      title: 'Remove workspace',
      children: <Text size="sm">Remove "{name}"? This stops its agent.</Text>,
      labels: { confirm: 'Remove', cancel: 'Cancel' },
      confirmProps: { color: 'red' },
      onConfirm: () => transport.send({ type: 'remove-space', workspace: name }),
    })
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
        <BellIcon muted={muted} />
      </button>
      <Menu position="bottom-end" width={200}>
        <Menu.Target>
          <button
            type="button"
            className={clsx(styles.action, keepAwake && styles.on)}
            title={`Keep awake: ${KEEP_AWAKE_MODES.find((m) => m.mode === keepAwakeMode)?.label}`}
          >
            <MugIcon />
          </button>
        </Menu.Target>
        <Menu.Dropdown>
          <Menu.Label>Keep awake</Menu.Label>
          {KEEP_AWAKE_MODES.map(({ mode, label }) => (
            <Menu.Item
              key={mode}
              leftSection={<CheckIcon active={mode === keepAwakeMode} />}
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
        <GearIcon />
      </button>
      <Menu position="bottom-end" width={180}>
        <Menu.Target>
          <button type="button" className={styles.action} title="Workspace actions">
            <DotsIcon />
          </button>
        </Menu.Target>
        <Menu.Dropdown>
          <Menu.Item onClick={exportSpace}>Export soromi.space.json</Menu.Item>
          <Menu.Item color="red" onClick={removeSpace}>
            Remove workspace
          </Menu.Item>
        </Menu.Dropdown>
      </Menu>
    </header>
  )
}

function BellIcon({ muted }: { muted: boolean }) {
  return (
    <svg
      width={16}
      height={16}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.7}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M18 16v-5a6 6 0 1 0-12 0v5l-1.5 2h15Z" />
      <path d="M10 20a2 2 0 0 0 4 0" />
      {muted && <path d="M4 4l16 16" />}
    </svg>
  )
}

function MugIcon() {
  return (
    <svg
      width={16}
      height={16}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.7}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M4 9h12v5a5 5 0 0 1-5 5H9a5 5 0 0 1-5-5Z" />
      <path d="M16 10h2a3 3 0 0 1 0 6h-2" />
      <path d="M8 3.5v3M12 3.5v3" />
    </svg>
  )
}

function CheckIcon({ active }: { active: boolean }) {
  return (
    <svg
      width={14}
      height={14}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2.4}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={clsx(styles.check, active && styles.checkOn)}
      aria-hidden="true"
    >
      <path d="M5 12l5 5L20 6" />
    </svg>
  )
}

function GearIcon() {
  return (
    <svg
      width={16}
      height={16}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.7}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1Z" />
    </svg>
  )
}

function DotsIcon() {
  return (
    <svg width={16} height={16} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <circle cx="5" cy="12" r="1.6" />
      <circle cx="12" cy="12" r="1.6" />
      <circle cx="19" cy="12" r="1.6" />
    </svg>
  )
}
