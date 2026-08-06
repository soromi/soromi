//Packages
import { useClientStore, useTransport } from '@soromi/client'

//Store
import { useAppStore } from '@/stores/app-store'

//Hooks
import { useWorkspaceShortcuts } from '@/features/workspaces/use-workspace-shortcuts'

//Components
import { StatusBar } from '@/features/status-bar/status-bar'
import { Sidebar } from '@/features/sidebar/sidebar'
import { Explorer } from '@/features/explorer/explorer'
import { TerminalDeck } from '@/features/terminal/terminal-deck'
import { Welcome } from '@/features/welcome/welcome'
import { OverlayHost } from './overlay-host'
import { Splash } from './splash'
import { StatusBanner } from './status-banner'
import { UpdateBanner } from './update-banner'

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
    <div className="fixed inset-0 flex flex-col bg-[var(--soromi-bg-app)] text-[var(--soromi-text)]">
      <div className="flex min-h-0 flex-1">
        <Sidebar />
        <main className="relative flex min-w-0 flex-1 flex-col bg-[var(--soromi-bg-terminal)]">
          <UpdateBanner />
          <StatusBanner />
          {active !== null ? (
            <div className="flex min-h-0 flex-1 flex-col">
              <TerminalDeck transport={transport} />
            </div>
          ) : (
            <Welcome />
          )}
          <OverlayHost scope="content" />
        </main>
        {/* Always mounted so its width can animate 0 <-> open, pushing the content smoothly. */}
        <Explorer />
      </div>
      <StatusBar />
      <OverlayHost scope="full" handleEsc />
    </div>
  )
}
