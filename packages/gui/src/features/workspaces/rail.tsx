import { Anchor, Menu, Modal, Text } from '@mantine/core'
import clsx from 'clsx'
import { useState } from 'react'
import { useShallow } from 'zustand/react/shallow'

//Packages
import { useClientStore, useTransport } from '@soromi/client'

//Store
import { useAppStore } from '@/stores/app-store'

//Utils
import { openExternal, quit } from '@/lib/host'

//Constants
import { APP_VERSION, REPO_URL } from '@/config'

//Icons
import CaretSvg from '@/assets/icons/caret.svg?react'
import CheckSvg from '@/assets/icons/check.svg?react'
import FilesSvg from '@/assets/icons/files.svg?react'
import IsoLogo from '@/assets/icons/iso-dark.svg?react'
import MugSvg from '@/assets/icons/mug.svg?react'
import PlusSvg from '@/assets/icons/plus.svg?react'
import SettingsSvg from '@/assets/icons/settings.svg?react'
import SkillsSvg from '@/assets/icons/skills.svg?react'

//Styles
import styles from './rail.module.css'

//Types
import type { SidebarMode } from '@/stores/app-store'
import type { KeepAwakeMode } from '@soromi/protocol'
import type { ComponentType, SVGProps } from 'react'

const SECTIONS: {
  mode: SidebarMode
  label: string
  Icon: ComponentType<SVGProps<SVGSVGElement>>
}[] = [
  { mode: 'files', label: 'Files', Icon: FilesSvg },
  { mode: 'skills', label: 'Skills', Icon: SkillsSvg },
]

const KEEP_AWAKE_MODES: { mode: KeepAwakeMode; label: string }[] = [
  { mode: 'off', label: 'Off' },
  { mode: 'working', label: 'While agent works' },
  { mode: 'always', label: 'Always on' },
]

/** The far-left icon nav: the app-menu logo, sidebar sections, add, and settings. */
export function Rail() {
  const transport = useTransport()
  const { active, sidebarMode, setSidebarMode, openCreateSpace, openSettings, setNotice } =
    useAppStore(
      useShallow((s) => ({
        active: s.active,
        sidebarMode: s.sidebarMode,
        setSidebarMode: s.setSidebarMode,
        openCreateSpace: s.openCreateSpace,
        openSettings: s.openSettings,
        setNotice: s.setNotice,
      })),
    )
  const { keepAwake, keepAwakeMode, setKeepAwakeMode } = useClientStore(
    useShallow((s) => ({
      keepAwake: s.keepAwake,
      keepAwakeMode: s.keepAwakeMode,
      setKeepAwakeMode: s.setKeepAwakeMode,
    })),
  )
  const [aboutOpen, setAboutOpen] = useState(false)

  const checkUpdates = () => {
    setNotice('Checking for updates…')
    transport.send({ type: 'check-update' })
  }
  const selectKeepAwake = (mode: KeepAwakeMode) => {
    setKeepAwakeMode(mode)
    transport.send({ type: 'set-keep-awake-mode', mode })
  }

  return (
    <nav className={styles.rail}>
      <Menu position="right-start" width={230} withinPortal>
        <Menu.Target>
          <button type="button" className={styles.logo} title="Soromi">
            <IsoLogo width={24} height={24} />
            <span className={styles.logoBadge}>
              <CaretSvg width={10} height={10} />
            </span>
          </button>
        </Menu.Target>
        <Menu.Dropdown>
          <div className={styles.appHead}>
            <span className={styles.appHeadIcon}>
              <IsoLogo width={16} height={16} />
            </span>
            <div>
              <div className={styles.appHeadName}>Soromi</div>
              <div className={styles.appHeadVersion}>Version {APP_VERSION}</div>
            </div>
          </div>
          <Menu.Divider />
          <Menu.Item onClick={() => setAboutOpen(true)}>About Soromi</Menu.Item>
          <Menu.Divider />
          <Menu.Item
            rightSection={<span className={styles.shortcut}>⌘,</span>}
            onClick={openSettings}
          >
            Settings
          </Menu.Item>
          <Menu.Item onClick={checkUpdates}>Check for updates…</Menu.Item>
          <Menu.Divider />
          <Menu.Item rightSection={<span className={styles.shortcut}>⌘Q</span>} onClick={quit}>
            Quit Soromi
          </Menu.Item>
        </Menu.Dropdown>
      </Menu>

      <Modal
        opened={aboutOpen}
        onClose={() => setAboutOpen(false)}
        withCloseButton={false}
        centered
        size={340}
      >
        <div className={styles.about}>
          <span className={styles.aboutIcon}>
            <IsoLogo width={34} height={34} />
          </span>
          <div className={styles.aboutName}>Soromi</div>
          <div className={styles.aboutVersion}>Version {APP_VERSION}</div>
          <Text size="sm" c="dimmed" ta="center">
            A small, fast home for AI coding agents. The daemon owns the terminals; this window is
            just a viewport.
          </Text>
          <Anchor size="sm" component="button" type="button" onClick={() => openExternal(REPO_URL)}>
            github.com/soromi/soromi
          </Anchor>
        </div>
      </Modal>
      <div className={styles.divider} />

      <div className={styles.sections}>
        {SECTIONS.map(({ mode, label, Icon }) => (
          <button
            key={mode}
            type="button"
            className={clsx(styles.section, active && sidebarMode === mode && styles.active)}
            title={label}
            onClick={() => setSidebarMode(mode)}
            disabled={!active}
          >
            <Icon width={20} height={20} />
          </button>
        ))}
      </div>
      <span className={styles.spacer} />
      <button
        type="button"
        className={styles.section}
        title="New workspace"
        onClick={openCreateSpace}
      >
        <PlusSvg width={18} height={18} />
      </button>

      <Menu position="right-end" width={200} withinPortal>
        <Menu.Target>
          <button
            type="button"
            className={clsx(styles.section, keepAwake && styles.sectionOn)}
            title={`Keep awake: ${KEEP_AWAKE_MODES.find((m) => m.mode === keepAwakeMode)?.label}`}
          >
            <MugSvg width={19} height={19} />
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

      <button type="button" className={styles.section} title="Settings" onClick={openSettings}>
        <SettingsSvg width={19} height={19} />
      </button>
    </nav>
  )
}
