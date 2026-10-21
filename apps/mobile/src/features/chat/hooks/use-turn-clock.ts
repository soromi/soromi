import { useEffect } from 'react'

//State
import { useChatActions, useChatTurnStart } from '@/states/chat/chat.state.hook'

/**
 * When a session's running turn began, as far as this phone saw: set the first time the session is
 * seen working, kept while it works (also across leaving the screen), dropped when the turn ends.
 * `null` while no turn runs.
 */
export const useTurnClock = (session: string, working: boolean): number | null => {
  const since = useChatTurnStart(session)
  const actions = useChatActions()

  useEffect(() => {
    if (working) actions.startTurn(session)
    else actions.endTurn(session)
  }, [working, session, actions])

  return working ? (since ?? null) : null
}
