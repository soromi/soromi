import { USAGE_REFRESH_MS } from '@soromi/core'
import { useEffect, useState } from 'react'

//Transport
import { useTransport } from '../transport/transport-context'

//Types
import type { AgentUsage } from '@soromi/protocol'

/**
 * Loads plan usage for a workspace and keeps it fresh. Served from the daemon's cache on open, then
 * refreshed on a timer; `refresh()` forces a live fetch. Used by the status bar.
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
    }, USAGE_REFRESH_MS)

    return () => clearInterval(timer)
  }, [workspace, transport])

  const refresh = () => {
    if (!workspace) return

    setLoading(true)
    transport.send({ type: 'request-usage', workspace, force: true })
  }

  return { agents, loading, refresh }
}
