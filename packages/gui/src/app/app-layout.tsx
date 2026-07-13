//Packages
import { useClientStore, useTransport } from '@soromi/client'

//Store
import { useAppStore } from '@/stores/app-store'

//Hooks
import { useWorkspaceShortcuts } from '@/features/workspaces/use-workspace-shortcuts'

//Components
import { StatusBar } from '@/features/status-bar/status-bar'
import { Rail } from '@/features/workspaces/rail'
import { Sidebar } from '@/features/sidebar/sidebar'
import { TerminalDeck } from '@/features/terminal/terminal-deck'
import { Welcome } from '@/features/welcome/welcome'
import { OverlayHost } from './overlay-host'
import { Splash } from './splash'
import { StatusBanner } from './status-banner'
import { UpdateBanner } from './update-banner'

//Styles
import styles from './app-layout.module.css'

/**
 * The three-column shell. The workspace base (terminal) is persistent; overlays layer on
 * top via OverlayHost, so opening files or the create-space form never unmounts the terminal.
 */
export function AppLayout() {
  const transport = useTransport()
  const active = useAppStore((s) => s.active)
  const ready = useClientStore((s) => s.ready)

  useWorkspaceShortcuts()

  // Wait behind a splash until the first workspace list lands, so the shell never flashes the
  // empty/welcome state before the active workspace resolves.
  if (!ready) return <Splash />

  return (
    <div className={styles.root}>
      <div className={styles.shell}>
        <Rail />
        <Sidebar />
        <main className={styles.content}>
          <UpdateBanner />
          <StatusBanner />
          {active !== null ? (
            <div className={styles.terminalArea}>
              <TerminalDeck transport={transport} />
            </div>
          ) : (
            <Welcome />
          )}
          <OverlayHost scope="content" />
        </main>
      </div>
      <StatusBar />
      <OverlayHost scope="full" handleEsc />
    </div>
  )
}
