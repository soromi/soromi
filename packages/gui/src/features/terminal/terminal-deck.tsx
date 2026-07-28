import { useEffect, useMemo, useState } from 'react'
import { useShallow } from 'zustand/react/shallow'

//Packages
import { TakeoverScreen, TerminalSurface, useClientStore } from '@soromi/client'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
  SessionTabs,
} from '@soromi/ui'

//Store
import { useAppStore } from '@/stores/app-store'

//Constants
import { PROVIDERS } from '@/config/providers'
import { colors } from '@/config/theme'

//Components
import { ProviderIcon } from '@/shared/provider-icon'

//Icons
import PlusIcon from '@/assets/icons/plus.svg?react'

//Types
import type { Transport } from '@soromi/client'
import type { SessionTab } from '@soromi/ui'
import type { SessionSummary } from '@soromi/protocol'

/**
 * The active workspace's tabs and their terminals. Each visited session keeps a live pane
 * (parked when hidden), so switching tabs or workspaces is instant and preserves scrollback.
 * The tab strip belongs to the active workspace; a "＋" opens another session for a chosen agent.
 */
export function TerminalDeck({ transport }: { transport: Transport }) {
  const { active, activeSession, selectSession, explorerOpen, toggleExplorer } = useAppStore(
    useShallow((s) => ({
      active: s.active,
      activeSession: s.activeSession,
      selectSession: s.selectSession,
      explorerOpen: s.explorerOpen,
      toggleExplorer: s.toggleExplorer,
    })),
  )
  const { workspaces, accounts } = useClientStore(
    useShallow((s) => ({ workspaces: s.workspaces, accounts: s.accounts })),
  )
  const [visited, setVisited] = useState<string[]>([])

  const workspace = workspaces.find((w) => w.name === active)
  const sessions = workspace?.sessions ?? []
  const currentSession = active ? activeSession[active] : undefined

  // Only offer providers that have a usable account: one already bound in this workspace, or a
  // configured account profile with a login for that provider.
  const availableProviders = PROVIDERS.filter(
    (p) =>
      workspace?.accounts.some((a) => a.agent === p.value) ||
      accounts.some((acc) => p.value in acc.providers),
  )

  // Make sure account profiles are loaded so the new-session menu can filter by them.
  useEffect(() => {
    transport.send({ type: 'list-accounts' })
  }, [transport])

  // Mount a pane the first time its session becomes the active one.
  useEffect(() => {
    if (!currentSession) return
    setVisited((prev) => (prev.includes(currentSession) ? prev : [...prev, currentSession]))
  }, [currentSession])

  // Drop panes whose session no longer exists (closed tabs, removed spaces).
  useEffect(() => {
    const live = new Set(workspaces.flatMap((w) => w.sessions.map((s) => s.id)))
    setVisited((prev) => {
      const next = prev.filter((id) => live.has(id))
      return next.length === prev.length ? prev : next
    })
  }, [workspaces])

  const openTab = (agent: string) => {
    if (!active) return
    const bound = workspace?.accounts.some((a) => a.agent === agent)
    // A bound agent reuses its account; a new agent binds to the first account configured for it.
    const account = accounts.find((acc) => agent in acc.providers)?.name ?? 'personal'
    transport.send({
      type: 'open-session',
      workspace: active,
      agent,
      account: bound ? undefined : account,
    })
  }

  // Prepare the tab view data once (label, close-ability), so the strip only renders.
  const tabs = useMemo<SessionTab[]>(
    () =>
      sessions.map((session) => ({
        id: session.id,
        label: displayLabel(session, sessions),
        status: session.status,
        agent: session.agent,
        title: session.title ?? null,
        account: session.account,
        canClose: sessions.length > 1,
      })),
    [sessions],
  )

  const newSession = (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="flex h-[40px] w-11 cursor-pointer appearance-none items-center justify-center border-none bg-transparent text-[var(--soromi-text-dim)] text-base hover:bg-[var(--soromi-bg-hover)] hover:text-[var(--soromi-text)]"
          title="New session"
        >
          <PlusIcon width={16} height={16} />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-40">
        <DropdownMenuLabel>New session</DropdownMenuLabel>
        {availableProviders.length === 0 ? (
          <DropdownMenuItem disabled>No accounts configured</DropdownMenuItem>
        ) : (
          availableProviders.map((provider) => (
            <DropdownMenuItem key={provider.value} onClick={() => openTab(provider.value)}>
              <ProviderIcon provider={provider.value} size={14} />
              {provider.label}
            </DropdownMenuItem>
          ))
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  )

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {workspace && (
        <SessionTabs
          tabs={tabs}
          activeId={currentSession}
          onSelect={(id) => active && selectSession(active, id)}
          onRename={(id, title) => transport.send({ type: 'rename-session', session: id, title })}
          onClose={(id) => transport.send({ type: 'close-session', session: id })}
          renderIcon={(agent) => <ProviderIcon provider={agent} size={16} />}
          trailing={newSession}
          rightSlot={
            !explorerOpen && (
              <button
                type="button"
                title="Explorer"
                onClick={toggleExplorer}
                className="mr-2 flex cursor-pointer appearance-none items-center gap-[7px] self-center rounded-lg border-none bg-transparent px-2.5 py-[5px] font-semibold text-[12px] text-[var(--soromi-text-faint)] hover:bg-[var(--soromi-bg-hover)] hover:text-[var(--soromi-text-dim)]"
              >
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <path d="M3 8a2 2 0 0 1 2-2h3.5l2 2H19a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
                </svg>
                Explorer
              </button>
            )
          }
        />
      )}
      {/* `isolate` keeps the takeover overlay's z-index contained to the terminal area, so it
          can't paint over the status bar or its popups (usage / devices). */}
      <div className="relative isolate flex min-h-0 flex-1 flex-col">
        {visited.map((id) => (
          <TerminalSurface
            key={id}
            transport={transport}
            session={id}
            active={id === currentSession}
            background={colors.bgTerminal}
            foreground={colors.text}
          />
        ))}
        <TakeoverScreen />
      </div>
    </div>
  )
}

/** A tab's display name: its custom title, or the account, auto-indexed when it collides. */
function displayLabel(session: SessionSummary, sessions: SessionSummary[]): string {
  if (session.title) return session.title
  const peers = sessions.filter((s) => !s.title && s.account === session.account)
  const index = peers.findIndex((s) => s.id === session.id)
  return index <= 0 ? session.account : `${session.account} ${index}`
}
