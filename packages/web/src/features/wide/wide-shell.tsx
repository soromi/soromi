import { useShallow } from 'zustand/react/shallow'

//Packages
import { useClientStore } from '@soromi/client'

//Store
import { useUiStore } from '@/stores/ui-store'

//Components
import { TerminalDeck } from '@/features/terminal/terminal-deck'
import { OverlayHost } from '@/app/overlay-host'
import { Rail } from './rail'
import { Sidebar } from './sidebar'
import { SessionTabs } from './session-tabs'
import { StatusBar } from './status-bar'

//Styles
import styles from './wide-shell.module.css'

/**
 * The wide (desktop-style) web layout: a rail + sidebar + terminal, the same three-column shell as
 * the desktop app. Shown on large screens; the phone gets the bottom-tab MobileShell instead. The
 * terminal deck stays mounted while switching workspaces, so its parked terminals survive.
 */
export function WideShell() {
  const { active, activeSession, fontSize } = useUiStore(
    useShallow((s) => ({
      active: s.active,
      activeSession: s.activeSession,
      fontSize: s.fontSize,
    })),
  )
  const workspace = useClientStore((s) => s.workspaces.find((w) => w.name === active))
  const session = active ? activeSession[active] : undefined

  return (
    <div className={styles.root}>
      <div className={styles.shell}>
        <Rail />
        <Sidebar workspace={workspace} session={session} />
        <main className={styles.content}>
          {workspace ? (
            <>
              <SessionTabs workspace={workspace} />
              <div className={styles.terminalArea}>
                <TerminalDeck active={session} fontSize={fontSize} />
              </div>
            </>
          ) : (
            <div className={styles.empty}>No workspace selected</div>
          )}
          {/* Full-page overlays (file view, …) cover the content area, over the terminal. */}
          <OverlayHost />
        </main>
      </div>
      <StatusBar />
    </div>
  )
}
