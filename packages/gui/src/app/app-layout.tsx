//Services
import { useTransport } from '@/services/transport/transport-context'

//Store
import { useAppStore } from '@/stores/app-store'

//Components
import { Rail } from '@/features/workspaces/rail'
import { Sidebar } from '@/features/sidebar/sidebar'
import { TerminalDeck } from '@/features/terminal/terminal-deck'
import { TerminalHeader } from '@/features/terminal/terminal-header'
import { Welcome } from '@/features/welcome/welcome'
import { OverlayHost } from './overlay-host'
import { StatusBanner } from './status-banner'

//Styles
import styles from './app-layout.module.css'

/**
 * The three-column shell. The workspace base (terminal) is persistent; overlays layer on
 * top via OverlayHost, so opening files or the create-space form never unmounts the terminal.
 */
export function AppLayout() {
  const transport = useTransport()
  const active = useAppStore((s) => s.active)

  return (
    <div className={styles.shell}>
      <Rail />
      <Sidebar />
      <main className={styles.content}>
        <StatusBanner />
        {active !== null ? (
          <>
            <TerminalHeader />
            <div className={styles.terminalArea}>
              <TerminalDeck transport={transport} />
            </div>
          </>
        ) : (
          <Welcome />
        )}
        <OverlayHost />
      </main>
    </div>
  )
}
