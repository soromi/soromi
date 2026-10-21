import { useCallback, useMemo } from 'react'

//Helpers
import { getSessionName } from '../helpers'

//Hooks
import { useOpenSession } from './use-open-session'

//Type
import type { SessionSummary } from '@soromi/protocol'
import type { SessionTarget } from '../types'

/**
 * What a session is wherever the home shows it, as a row or as a card: its name, a tap that opens
 * its conversation, and a long press that asks for its menu.
 */
export const useSessionItem = (
  session: SessionSummary,
  peers: SessionSummary[],
  onMenu: (target: SessionTarget) => void,
) => {
  const open = useOpenSession()
  const id = session.id

  const name = useMemo(() => getSessionName(session, peers), [session, peers])

  const handleOpen = useCallback(() => open(id), [open, id])

  const mode = session.mode
  const handleLongPress = useCallback(() => onMenu({ id, name, mode }), [onMenu, id, name, mode])

  return { name, handleOpen, handleLongPress }
}
