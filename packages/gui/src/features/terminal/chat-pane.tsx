import { useEffect, useMemo, useRef, useState } from 'react'

//Packages
import { deferredFiles, useClientStore } from '@soromi/client'
import { cn } from '@soromi/ui'
import { ChatView, contextLimitFor } from '@soromi/ui/chat'

//Store
import { useAppStore } from '@/stores/app-store'

//Components
import { agentOptionsFor } from '@/shared/agent-options'
import { ProviderIcon } from '@/shared/provider-icon'

//Types
import type { Transport } from '@soromi/client'
import type { SlashCommand } from '@soromi/protocol'

/** A stable empty list, so a session with no commands yet doesn't hand the view a new array each render. */
const NO_COMMANDS: SlashCommand[] = []

// When a turn started, per session — kept outside React (the daemon owns the running turn, not the
// UI). Switching chats unmounts the pane, so a mount-based clock would restart; this keeps the
// elapsed "working" seconds anchored to the real turn start across remounts.
const turnStartedAt = new Map<string, number>()

/**
 * A desktop pane for a headless "chat" session: attaches so the daemon streams the conversation into
 * the store, renders it with the shared chat view, and sends follow-ups as `chat-turn` (a headless
 * turn), not terminal input. Parked (hidden) when it isn't the active session, like `TerminalSurface`.
 */
export function ChatPane({
  transport,
  session,
  active,
}: {
  transport: Transport
  session: string
  active: boolean
}) {
  const events = useClientStore((s) => s.chat[session])
  const cursor = useClientStore((s) => s.chatCursor[session])
  const streaming = useClientStore((s) => s.chatDelta[session])
  const approvals = useClientStore((s) => s.chatApproval[session])
  const canLoadEarlier = useClientStore((s) => s.chatEarlier[session] ?? false)
  const commands = useClientStore((s) => s.commands[session])
  const inControl = useClientStore((s) => s.controlHolder === null)
  const workspace = useClientStore((s) =>
    s.workspaces.find((w) => w.sessions.some((x) => x.id === session)),
  )
  const summary = workspace?.sessions.find((x) => x.id === session)
  const openAgent = useAppStore((s) => s.openAgent)
  // The agents this chat can switch to: only *this* workspace's real bound agents (phantom bindings
  // filtered out via the profiles) — never accounts from other workspaces. To use another provider,
  // bind it to this workspace in its settings. `list-accounts` (fired by the sidebar) loads profiles.
  const accounts = useClientStore((s) => s.accounts)
  const agentOptions = useMemo(
    () => agentOptionsFor(workspace?.accounts ?? [], accounts ?? [], false),
    [workspace?.accounts, accounts],
  )
  // The agent is mid-turn while its status is "thinking" — drives the live working indicator.
  const working = summary?.status === 'thinking'
  const permissionMode = summary?.permissionMode ?? 'default'
  // Subscribe to the catalog signal: the model catalog lives in @soromi/ui (outside React), so a
  // bump re-renders this pane when it lands, updating the model picker and the context meter.
  void useClientStore((s) => s.modelCatalogVersion)
  // The model's context window, for the "context filling up" banner — from the provider's catalog.
  const contextLimit = contextLimitFor(summary?.agent, summary?.model ?? null)

  // Record the turn's start once (kept across remounts), and clear it when the turn ends, so the
  // working clock counts from when the agent actually started — not from when this pane last mounted.
  if (working) {
    if (!turnStartedAt.has(session)) turnStartedAt.set(session, Date.now())
  } else {
    turnStartedAt.delete(session)
  }
  const workingSince = working ? (turnStartedAt.get(session) ?? null) : null

  // Attach so the daemon brings the chat in the store up to date and streams what follows. The
  // cursor of what is already held goes along, so a remount or a reconnect is sent only what was
  // missed. Re-attach whenever the transport (re)opens, so a not-yet-connected mount still lands.
  const [link, setLink] = useState(0)
  useEffect(() => {
    const doAttach = () => {
      if (!transport.isOpen()) return
      const chat = useClientStore.getState().chatCursor[session]
      transport.send({ type: 'attach', session, chat })
    }
    doAttach()
    return transport.onOpen(() => {
      doAttach()
      setLink((n) => n + 1)
    })
  }, [transport, session])

  // Chat events come without the bytes of attached files. Ask for the ones in the messages loaded
  // here, once the chat is on screen; each is asked for once per connection (an answer lost to a
  // dropped link is asked for again on the next).
  const asked = useRef({ link: -1, files: new Set<string>() })
  useEffect(() => {
    if (!active || !events || !cursor) return
    if (asked.current.link !== link) asked.current = { link, files: new Set() }
    for (const { seq, index } of deferredFiles({ events, cursor })) {
      const key = `${cursor.log}:${seq}:${index}`
      if (asked.current.files.has(key)) continue
      asked.current.files.add(key)
      transport.send({ type: 'chat-fetch-file', session, log: cursor.log, seq, index })
    }
  }, [active, events, cursor, link, transport, session])

  return (
    <div className={cn('absolute inset-0', !active && 'hidden')}>
      <ChatView
        events={events ?? []}
        streaming={streaming}
        working={working}
        workingSince={workingSince}
        disabled={!inControl}
        placeholder="Message the agent…"
        emptyLabel="New chat — send a message to start."
        onSend={(text, files) =>
          transport.send({ type: 'chat-turn', session, text, files: files ?? [] })
        }
        onQueue={(text, files) =>
          transport.send({ type: 'chat-queue', session, text, files: files ?? [] })
        }
        queued={summary?.queued}
        queuePaused={summary?.queuePaused}
        onUnqueue={(id, send) => transport.send({ type: 'chat-unqueue', session, id, send })}
        onStop={() => transport.send({ type: 'chat-interrupt', session })}
        subagents={summary?.subagents ?? []}
        onOpenAgent={(agent) => agent.id && openAgent(session, agent.id, agent.name)}
        commands={commands ?? NO_COMMANDS}
        approvals={approvals}
        onApproval={(id, allow) =>
          transport.send({ type: 'chat-approval-response', session, id, allow })
        }
        permissionMode={permissionMode}
        onPermissionMode={(mode) => transport.send({ type: 'chat-permission-mode', session, mode })}
        model={summary?.model ?? null}
        effort={summary?.effort ?? null}
        onModel={(model, effort) =>
          transport.send({ type: 'chat-set-model', session, model, effort })
        }
        account={summary?.account}
        accountIcon={summary?.agent ? <ProviderIcon provider={summary.agent} /> : undefined}
        agent={summary?.agent}
        agentOptions={agentOptions}
        onAgent={(agent, account) =>
          transport.send({ type: 'set-session-agent', session, agent, account })
        }
        contextTokens={summary?.context_tokens ?? null}
        contextLimit={contextLimit}
        onCommand={(command) => transport.send({ type: 'chat-command', session, command })}
        draftKey={session}
        canLoadEarlier={canLoadEarlier}
        onLoadEarlier={() =>
          transport.send({
            type: 'chat-load-earlier',
            session,
            loaded: events?.length ?? 0,
          })
        }
      />
    </div>
  )
}
