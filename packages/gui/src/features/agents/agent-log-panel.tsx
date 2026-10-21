import { useEffect } from 'react'

//Packages
import { agentLogKey, useClientStore, useTransport } from '@soromi/client'
import { AgentLogView } from '@soromi/ui/chat'

//Components
import { DockedPanel } from '@/features/files/docked-panel'

//Types
import type { Overlay } from '@/stores/app-store'

type AgentOverlay = Extract<Overlay, { type: 'agent' }>

/**
 * A background agent's own conversation, docked beside the chat (see `DockedPanel`): the daemon is
 * asked to follow it while this is open, and again whenever the link comes back.
 */
export function AgentLogPanel({ overlay }: { overlay: AgentOverlay }) {
  const { session, agent, name } = overlay
  const transport = useTransport()
  const log = useClientStore((s) => s.agentLogs[agentLogKey(session, agent)])
  // Still at work while the session lists it, since when it says.
  const startedAt = useClientStore((s) => {
    for (const w of s.workspaces) {
      const listed = w.sessions
        .find((x) => x.id === session)
        ?.subagents?.find((a) => a.id === agent)
      if (listed) return listed.started_at ?? 0
    }
    return null
  })
  const running = startedAt !== null

  useEffect(() => {
    const watch = () => {
      if (transport.isOpen()) transport.send({ type: 'watch-agent', session, agent })
    }
    watch()
    const offOpen = transport.onOpen(watch)
    return () => {
      offOpen()
      if (transport.isOpen()) transport.send({ type: 'watch-agent', session })
    }
  }, [transport, session, agent])

  return (
    <DockedPanel name={name} subtitle={running ? 'Working in the background' : 'Finished'}>
      <AgentLogView
        events={log?.events ?? []}
        loaded={log?.loaded ?? false}
        earlier={log?.earlier ?? false}
        running={running}
        since={startedAt ? startedAt * 1000 : null}
      />
    </DockedPanel>
  )
}
