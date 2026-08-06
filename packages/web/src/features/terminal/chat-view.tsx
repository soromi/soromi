//Packages
import { useClientStore, useTransport } from '@soromi/client'
import { ChatView as ChatConversation } from '@soromi/ui/chat'

/**
 * The mobile chat view for a terminal (PTY) session: renders the agent's transcript and sends a
 * follow-up as terminal input, so it drives the same live session under the same control model
 * (disabled unless this viewport holds control). The conversation + composer are the shared
 * `@soromi/ui/chat` renderer; only the store + transport wiring lives here.
 */
export function ChatView({ session }: { session: string }) {
  const transport = useTransport()
  const events = useClientStore((s) => s.chat[session])
  const inControl = useClientStore((s) => s.controlHolder === null)

  return (
    <ChatConversation
      events={events ?? []}
      disabled={!inControl}
      placeholder="Reply to the agent…"
      emptyLabel="Waiting for the agent's transcript… start typing below, or switch to Terminal."
      // A terminal session's follow-up is typed into the PTY, so it submits like any input.
      onSend={(text) => transport.send({ type: 'input', session, data: `${text}\r` })}
    />
  )
}
