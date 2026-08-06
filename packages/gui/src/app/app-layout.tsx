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
    <div className="fixed inset-0 flex flex-col bg-[var(--soromi-bg-shell)] text-[var(--soromi-text)]">
      <div className="flex min-h-0 flex-1">
        <Sidebar />
        {/* One rounded panel floating on the shell (design), inset 8px top/right/bottom. The content
            and the Explorer are columns *inside* it — no gap or divider between them. */}
        <div className="relative my-2 mr-2 flex min-w-0 flex-1 overflow-hidden rounded-[12px] border border-[var(--soromi-border-subtle)] bg-[var(--soromi-bg-terminal)] shadow-[0_1px_2px_rgb(0_0_0/40%),0_10px_30px_rgb(0_0_0/32%)]">
          <main className="relative flex min-w-0 flex-1 flex-col">
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
      </div>
      <StatusBar />
      <OverlayHost scope="full" handleEsc />
    </div>
  )
}
