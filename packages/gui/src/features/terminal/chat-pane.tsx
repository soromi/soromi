import { useEffect } from 'react'

//Packages
import { useClientStore } from '@soromi/client'
import { cn } from '@soromi/ui'
import { ChatView } from '@soromi/ui/chat'

//Types
import type { Transport } from '@soromi/client'

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
  const streaming = useClientStore((s) => s.chatDelta[session])
  const approvals = useClientStore((s) => s.chatApproval[session])
  const canLoadEarlier = useClientStore((s) => s.chatEarlier[session] ?? false)
  const inControl = useClientStore((s) => s.controlHolder === null)
  const summary = useClientStore((s) =>
    s.workspaces.flatMap((w) => w.sessions).find((x) => x.id === session),
  )
  // The agent is mid-turn while its status is "thinking" — drives the live working indicator.
  const working = summary?.status === 'thinking'
  const permissionMode = summary?.permissionMode ?? 'default'

  // Attach so the daemon replays the transcript-so-far and streams new chat/status into the store.
  // Re-attach whenever the transport (re)opens, so a not-yet-connected mount still lands.
  useEffect(() => {
    const doAttach = () => {
      if (transport.isOpen()) transport.send({ type: 'attach', session })
    }
    doAttach()
    return transport.onOpen(doAttach)
  }, [transport, session])

  return (
    <div className={cn('absolute inset-0', !active && 'hidden')}>
      <ChatView
        events={events ?? []}
        streaming={streaming}
        working={working}
        disabled={!inControl}
        placeholder="Message the agent…"
        emptyLabel="New chat — send a message to start."
        onSend={(text, files) =>
          transport.send({ type: 'chat-turn', session, text, files: files ?? [] })
        }
        onStop={() => transport.send({ type: 'chat-interrupt', session })}
        approvals={approvals}
        onApproval={(id, allow) =>
          transport.send({ type: 'chat-approval-response', session, id, allow })
        }
        permissionMode={permissionMode}
        onPermissionMode={(mode) =>
          transport.send({ type: 'chat-permission-mode', session, mode })
        }
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
