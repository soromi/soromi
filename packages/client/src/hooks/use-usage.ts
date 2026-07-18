import { useEffect, useState } from 'react'

//Transport
import { useTransport } from '../transport/transport-context'

//Types
import type { AgentUsage } from '@soromi/protocol'

/** Auto-refresh cadence, matching the daemon's usage cache window. */
const REFRESH_MS = 15 * 60 * 1000

/**
 * Loads plan usage for a workspace and keeps it fresh. Served from the daemon's cache on open, then
 * refreshed on a timer; `refresh()` forces a live fetch. Shared by the desktop and web status bars.
 */
export function useUsage(workspace: string | null): {
  agents: AgentUsage[]
  loading: boolean
  refresh: () => void
} {
  const transport = useTransport()
  const [agents, setAgents] = useState<AgentUsage[]>([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    const off = transport.onMessage((message) => {
      if (message.type === 'usage' && message.workspace === workspace) {
        setAgents(message.agents)
        setLoading(false)
      }
    })

    return off
  }, [transport, workspace])

  useEffect(() => {
    if (!workspace) {
      setAgents([])
      return
    }

    setAgents([])
    setLoading(true)
    transport.send({ type: 'request-usage', workspace, force: false })

    const timer = setInterval(() => {
      transport.send({ type: 'request-usage', workspace, force: false })
    }, REFRESH_MS)

    return () => clearInterval(timer)
  }, [workspace, transport])

  const refresh = () => {
    if (!workspace) return

    setLoading(true)
    transport.send({ type: 'request-usage', workspace, force: true })
  }

  return { agents, loading, refresh }
}
