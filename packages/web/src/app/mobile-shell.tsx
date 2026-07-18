import clsx from 'clsx'
import { useShallow } from 'zustand/react/shallow'

//Packages
import { useClientStore } from '@soromi/client'

//Store
import { useUiStore } from '@/stores/ui-store'

//Components
import { FilesPanel } from '@/features/files/files-panel'
import { KeyBar } from '@/features/keybar/key-bar'
import { TabBar } from '@/features/nav/tab-bar'
import { SessionMenu } from '@/features/session-menu/session-menu'
import { SkillsPanel } from '@/features/skills/skills-panel'
import { TerminalDeck } from '@/features/terminal/terminal-deck'
import { WorkspaceBar } from '@/features/workspace-bar/workspace-bar'
import { WorkspaceSheet } from '@/features/workspaces/workspace-sheet'
import { OverlayHost } from './overlay-host'

//Styles
import styles from './mobile-shell.module.css'

/**
 * The phone shell: a persistent terminal base with the Files / Skills panels layered over it, a
 * bottom tab bar to switch between them, and the workspace bar + key bar as docked chrome. The
 * terminal deck stays mounted across tab and workspace switches, so its parked terminals survive.
 */
export function MobileShell() {
  const { active, activeSession, tab, keyboardVisible, fontSize } = useUiStore(
    useShallow((s) => ({
      active: s.active,
      activeSession: s.activeSession,
      tab: s.tab,
      keyboardVisible: s.keyboardVisible,
      fontSize: s.fontSize,
    })),
  )
  const workspace = useClientStore((s) => s.workspaces.find((w) => w.name === active))
  const connected = useClientStore((s) => s.connected)
  const session = active ? activeSession[active] : undefined

  const showKeys = tab === 'terminal' && connected && keyboardVisible

  return (
    <div className={styles.shell}>
      <main className={styles.body}>
        {/* The deck never unmounts; it is only hidden when another tab is on top. */}
        <div className={clsx(styles.pane, tab !== 'terminal' && styles.hidden)}>
          <TerminalDeck active={session} fontSize={fontSize} />
        </div>
        {tab === 'files' && <FilesPanel workspace={workspace?.name} />}
        {tab === 'skills' && <SkillsPanel session={session} />}
        {/* Full-page overlays (file view, …) cover the body, over the terminal / panels. */}
        <OverlayHost />
      </main>

      {showKeys && <KeyBar session={session} />}
      <WorkspaceBar />
      <TabBar />

      <WorkspaceSheet />
      <SessionMenu />
    </div>
  )
}
