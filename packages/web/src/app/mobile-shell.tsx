import { useShallow } from 'zustand/react/shallow'

//Packages
import { useClientStore } from '@soromi/client'

//Store
import { useUiStore } from '@/stores/ui-store'

//Components
import { KeyBar } from '@/features/keybar/key-bar'
import { TabStrip } from '@/features/tabs/tab-strip'
import { TerminalDeck } from '@/features/terminal/terminal-deck'
import { TopBar } from '@/features/top-bar/top-bar'
import { OverlayHost } from './overlay-host'

//Styles
import styles from './mobile-shell.module.css'

/**
 * The phone shell: a persistent full-screen terminal base with a top bar and tab strip above it
 * and a key bar below. Navigation (workspaces, files/skills) is an overlay stack layered on top
 * via OverlayHost, never a swap that unmounts the terminal, the same concept as the desktop app.
 */
export function MobileShell() {
  const { active, activeSession } = useUiStore(
    useShallow((s) => ({ active: s.active, activeSession: s.activeSession })),
  )
  const workspace = useClientStore((s) => s.workspaces.find((w) => w.name === active))
  const session = active ? activeSession[active] : undefined

  return (
    <div className={styles.shell}>
      <TopBar />
      {workspace && <TabStrip workspace={workspace} />}
      {/* The deck stays mounted across workspace switches, so its parked terminals survive. */}
      <main className={styles.terminal}>
        <TerminalDeck active={session} />
      </main>
      <KeyBar session={session} />
      <OverlayHost />
    </div>
  )
}
