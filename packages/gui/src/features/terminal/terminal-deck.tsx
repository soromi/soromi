import { Menu } from '@mantine/core'
import clsx from 'clsx'
import { useEffect, useState } from 'react'
import { useShallow } from 'zustand/react/shallow'

//Packages
import { TerminalSurface, useClientStore } from '@soromi/client'

//Store
import { useAppStore } from '@/stores/app-store'

//Constants
import { PROVIDERS } from '@/config/providers'
import { colors, statusVariant } from '@/config/theme'

//Components
import { ProviderIcon } from '@/shared/provider-icon'

//Icons
import CloseIcon from '@/assets/icons/close.svg?react'
import PlusIcon from '@/assets/icons/plus.svg?react'

//Styles
import styles from './terminal-deck.module.css'

//Types
import type { Transport } from '@soromi/client'
import type { SessionSummary } from '@soromi/protocol'

/**
 * The active workspace's tabs and their terminals. Each visited session keeps a live pane
 * (parked when hidden), so switching tabs or workspaces is instant and preserves scrollback.
 * The tab strip belongs to the active workspace; a "＋" opens another session for a chosen agent.
 */
export function TerminalDeck({ transport }: { transport: Transport }) {
  const { active, activeSession, selectSession } = useAppStore(
    useShallow((s) => ({
      active: s.active,
      activeSession: s.activeSession,
      selectSession: s.selectSession,
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
  const closeTab = (id: string) => transport.send({ type: 'close-session', session: id })

  return (
    <div className={styles.deck}>
      {workspace && (
        <div className={styles.tabBar}>
          <div className={styles.tabs}>
            {sessions.map((session) => (
              <Tab
                key={session.id}
                session={session}
                label={displayLabel(session, sessions)}
                active={session.id === currentSession}
                onSelect={() => active && selectSession(active, session.id)}
                onRename={(title) =>
                  transport.send({ type: 'rename-session', session: session.id, title })
                }
                onClose={sessions.length > 1 ? () => closeTab(session.id) : undefined}
              />
            ))}
            <Menu position="bottom-start" width={160}>
              <Menu.Target>
                <button type="button" className={styles.newTab} title="New session">
                  <PlusIcon width={16} height={16} />
                </button>
              </Menu.Target>
              <Menu.Dropdown>
                <Menu.Label>New session</Menu.Label>
                {availableProviders.length === 0 ? (
                  <Menu.Item disabled>No accounts configured</Menu.Item>
                ) : (
                  availableProviders.map((provider) => (
                    <Menu.Item
                      key={provider.value}
                      leftSection={<ProviderIcon provider={provider.value} size={14} />}
                      onClick={() => openTab(provider.value)}
                    >
                      {provider.label}
                    </Menu.Item>
                  ))
                )}
              </Menu.Dropdown>
            </Menu>
          </div>
        </div>
      )}
      <div className={styles.panes}>
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

function Tab({
  session,
  label,
  active,
  onSelect,
  onRename,
  onClose,
}: {
  session: SessionSummary
  label: string
  active: boolean
  onSelect: () => void
  onRename: (title: string) => void
  onClose?: () => void
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState('')

  const startEdit = () => {
    setDraft(session.title ?? '')
    setEditing(true)
  }
  const commit = () => {
    setEditing(false)
    onRename(draft.trim())
  }

  return (
    <div className={clsx(styles.tab, active && styles.tabActive)}>
      {editing ? (
        <input
          // biome-ignore lint/a11y/noAutofocus: focus the field the user just opened to rename.
          autoFocus
          className={styles.tabInput}
          value={draft}
          placeholder={session.account}
          onChange={(event) => setDraft(event.currentTarget.value)}
          onBlur={commit}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault()
              commit()
            } else if (event.key === 'Escape') {
              setEditing(false)
            }
          }}
        />
      ) : (
        <button
          type="button"
          className={styles.tabMain}
          onClick={onSelect}
          onDoubleClick={startEdit}
          title="Double-click to rename"
        >
          <ProviderIcon provider={session.agent} size={16} />
          <span className={styles.tabLabel}>{label}</span>
          {session.status !== 'idle' && (
            <span className={clsx(styles.tabDot, styles[statusVariant(session.status)])} />
          )}
        </button>
      )}
      {onClose && !editing && (
        <button type="button" className={styles.tabClose} title="Close session" onClick={onClose}>
          <CloseIcon width={13} height={13} />
        </button>
      )}
    </div>
  )
}
