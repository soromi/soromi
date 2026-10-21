import { useEffect, useMemo, useState } from 'react'
import { useShallow } from 'zustand/react/shallow'

//Packages
import { TakeoverBar, TerminalSurface, useClientStore } from '@soromi/client'

//Store
import { useAppStore } from '@/stores/app-store'

//Constants
import { colors } from '@/config/theme'

//Components
import { ChatPane } from './chat-pane'
import { ExplorerTabs } from '@/features/explorer/explorer-tabs'
import { ProviderIcon } from '@/shared/provider-icon'

//Types
import type { Transport } from '@soromi/client'
import type { SessionSummary } from '@soromi/protocol'
import type { SidebarMode } from '@/stores/app-store'

/**
 * The active workspace's terminals. Each visited session keeps a live pane (parked when hidden), so
 * switching sessions or workspaces is instant and preserves scrollback. Sessions are navigated from
 * the sidebar's workspace cards now — there is no tab strip; the header just names the one in view
 * (its provider glyph + title) and, while the Explorer is closed, offers its views as icons.
 */
export function TerminalDeck({ transport }: { transport: Transport }) {
  const { active, activeSession, explorerOpen, setExplorerOpen, setSidebarMode } = useAppStore(
    useShallow((s) => ({
      active: s.active,
      activeSession: s.activeSession,
      explorerOpen: s.explorerOpen,
      setExplorerOpen: s.setExplorerOpen,
      setSidebarMode: s.setSidebarMode,
    })),
  )
  const openExplorer = (mode: SidebarMode) => {
    setSidebarMode(mode)
    setExplorerOpen(true)
  }
  const workspaces = useClientStore((s) => s.workspaces)
  const [visited, setVisited] = useState<string[]>([])

  const workspace = workspaces.find((w) => w.name === active)
  const sessions = workspace?.sessions ?? []
  const currentSession = active ? activeSession[active] : undefined
  const session = sessions.find((s) => s.id === currentSession)
  // Every live session across workspaces, so a parked pane renders in the right mode (chat vs. term).
  const byId = useMemo(
    () => new Map(workspaces.flatMap((w) => w.sessions).map((s) => [s.id, s])),
    [workspaces],
  )

  // Mount a pane the first time its session becomes the active one.
  useEffect(() => {
    if (!currentSession) return
    setVisited((prev) => (prev.includes(currentSession) ? prev : [...prev, currentSession]))
  }, [currentSession])

  // Drop panes whose session no longer exists (closed sessions, removed spaces).
  useEffect(() => {
    const live = new Set(workspaces.flatMap((w) => w.sessions.map((s) => s.id)))
    setVisited((prev) => {
      const next = prev.filter((id) => live.has(id))
      return next.length === prev.length ? prev : next
    })
  }, [workspaces])

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {workspace && (
        <div
          data-drag-region
          className="flex h-[40px] flex-none items-stretch justify-between pr-5"
        >
          <div className="flex min-w-0 flex-none items-center gap-[9px] px-4">
            {session ? (
              <>
                <span className="flex h-[15px] w-[15px] flex-none items-center justify-center">
                  <ProviderIcon provider={session.agent} size={15} />
                </span>
                <span className="overflow-hidden text-ellipsis whitespace-nowrap font-medium text-[13px] text-[var(--soromi-text)]">
                  {displayLabel(session, sessions)}
                </span>
              </>
            ) : (
              <span className="whitespace-nowrap text-[13px] text-[var(--soromi-text-faint)]">
                No active session
              </span>
            )}
          </div>
          <div data-drag-region className="min-w-0 flex-1" />
          {/* The Terminal/Chat mode toggle lives in the status bar now (see StatusBar). */}
          {/* While the Explorer is closed, its views sit here: each icon opens it on that view. */}
          {!explorerOpen && (
            <div className="mr-1 flex items-center self-center">
              <ExplorerTabs active={null} onSelect={openExplorer} />
            </div>
          )}
        </div>
      )}
      {/* Another device is in control: say so, and keep showing the sessions underneath. */}
      <TakeoverBar />
      <div className="relative isolate flex min-h-0 flex-1 flex-col">
        {visited.map((id) => {
          // Chat panes render their whole transcript (streamdown markdown + shiki highlighting), which
          // is heavy — and their state lives in the store, so we only mount the *active* one and let
          // hidden ones unmount (they re-render instantly from the store on return). Terminals must
          // stay mounted even when hidden, to preserve their xterm scrollback.
          if (byId.get(id)?.mode === 'chat') {
            return id === currentSession ? (
              <ChatPane key={id} transport={transport} session={id} active />
            ) : null
          }
          return (
            <TerminalSurface
              key={id}
              transport={transport}
              session={id}
              active={id === currentSession}
              background={colors.bgTerminal}
              foreground={colors.text}
            />
          )
        })}
      </div>
    </div>
  )
}

/** A session's display name: its custom title, or the account, auto-indexed when it collides. */
function displayLabel(session: SessionSummary, sessions: SessionSummary[]): string {
  if (session.title) return session.title
  const peers = sessions.filter((s) => !s.title && s.account === session.account)
  const index = peers.findIndex((s) => s.id === session.id)
  return index <= 0 ? session.account : `${session.account} ${index}`
}
