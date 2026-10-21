import { USAGE_REFRESH_MS } from '@soromi/core'
import { useCallback, useEffect, useState } from 'react'

//Services
import { LinkService } from '@/services/link'

//State
import { useDaemonUsage } from '@/states/daemon/daemon.state.hook'
import { useLinkOnline } from '@/states/link/link.state.hook'

//Type
import type { AgentUsage } from '@soromi/protocol'

/**
 * The plan usage of a workspace's agents (`undefined` until the first answer). It is asked for
 * when it is shown, again every quarter of an hour (how long the computer keeps a reading) and
 * whenever the link comes back. `refresh` has the computer read it afresh, skipping what it kept;
 * `refreshing` holds until that reading arrives. Shown under a workspace's sessions and on its
 * usage screen.
 */
export const useUsage = (workspace: string) => {
  const agents = useDaemonUsage(workspace)
  const online = useLinkOnline()
  // The reading there was when a refresh was asked for, `null` with none asked: the refresh is
  // under way until another reading takes its place.
  const [before, setBefore] = useState<AgentUsage[] | undefined | null>(null)

  useEffect(() => {
    const ask = () => LinkService.send({ type: 'request-usage', workspace, force: false })
    ask()
    const timer = setInterval(ask, USAGE_REFRESH_MS)
    const offOpen = LinkService.onOpen(ask)

    return () => {
      clearInterval(timer)
      offOpen()
    }
  }, [workspace])

  const refresh = useCallback(() => {
    // Without a link it would wait for one; the reading there is stays.
    if (!online) return
    setBefore(agents)
    LinkService.send({ type: 'request-usage', workspace, force: true })
  }, [online, agents, workspace])

  return { agents, refreshing: before !== null && before === agents, refresh }
}
