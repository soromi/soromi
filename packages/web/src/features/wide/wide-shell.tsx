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
    <div className="flex h-full flex-col overflow-hidden bg-[var(--soromi-bg-app)] text-[var(--soromi-text)]">
      <div className="flex min-h-0 flex-1">
        <Rail />
        <Sidebar workspace={workspace} session={session} />
        <main className="relative flex min-w-0 flex-1 flex-col bg-[var(--soromi-bg-terminal)]">
          {workspace ? (
            <>
              <SessionTabs workspace={workspace} />
              <div className="flex min-h-0 flex-1 flex-col">
                <TerminalDeck active={session} fontSize={fontSize} />
              </div>
            </>
          ) : (
            <div className="flex flex-1 items-center justify-center text-[var(--soromi-text-faint)] text-sm">
              No workspace selected
            </div>
          )}
          {/* Full-page overlays (file view, …) cover the content area, over the terminal. */}
          <OverlayHost />
        </main>
      </div>
      <StatusBar />
    </div>
  )
}
