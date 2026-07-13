import { Menu } from '@mantine/core'
import clsx from 'clsx'
import { useShallow } from 'zustand/react/shallow'

//Packages
import { useClientStore, useTransport } from '@soromi/client'

//Store
import { useAppStore } from '@/stores/app-store'

//Icons
import BellOffSvg from '@/assets/icons/bell-off.svg?react'
import BellSvg from '@/assets/icons/bell.svg?react'
import CheckSvg from '@/assets/icons/check.svg?react'
import MugSvg from '@/assets/icons/mug.svg?react'

//Styles
import styles from './workspace-controls.module.css'

//Types
import type { KeepAwakeMode } from '@soromi/protocol'

const KEEP_AWAKE_MODES: { mode: KeepAwakeMode; label: string }[] = [
  { mode: 'off', label: 'Off' },
  { mode: 'working', label: 'While agent works' },
  { mode: 'always', label: 'Always on' },
]

/** Notification-mute and keep-awake controls for the active workspace, in the top-right bar. */
export function WorkspaceControls() {
  const transport = useTransport()
  const active = useAppStore((s) => s.active)
  const { mutedMap, keepAwake, keepAwakeMode, setMuted, setKeepAwakeMode } = useClientStore(
    useShallow((s) => ({
      mutedMap: s.muted,
      keepAwake: s.keepAwake,
      keepAwakeMode: s.keepAwakeMode,
      setMuted: s.setMuted,
      setKeepAwakeMode: s.setKeepAwakeMode,
    })),
  )
  const muted = active ? (mutedMap[active] ?? false) : false

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
    <div className={styles.controls}>
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
  )
}
