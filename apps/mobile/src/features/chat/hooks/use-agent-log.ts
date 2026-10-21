import { useIsFocused } from 'expo-router'
import { useEffect } from 'react'

//Services
import { LinkService } from '@/services/link'

//State
import { useDaemonAgentLog, useDaemonListedAgent } from '@/states/daemon/daemon.state.hook'

/**
 * A background agent's own log, followed while its screen is on top: the daemon is asked for it
 * then, and again whenever the link comes back (it starts every connection from nothing), and is
 * told to stop once the screen is left.
 */
export const useAgentLog = (session: string, agent: string) => {
  const focused = useIsFocused()
  const log = useDaemonAgentLog(session, agent)
  const listed = useDaemonListedAgent(session, agent)
  const running = listed !== undefined
  // When it started, in the milliseconds the working line counts in.
  const since = listed?.started_at != null ? listed.started_at * 1000 : null

  useEffect(() => {
    if (!focused) return
    const watch = () => LinkService.send({ type: 'watch-agent', session, agent })
    watch()
    const stopListening = LinkService.onOpen(watch)

    return () => {
      stopListening()
      LinkService.send({ type: 'watch-agent', session })
    }
  }, [focused, session, agent])

  return { log, running, since }
}
