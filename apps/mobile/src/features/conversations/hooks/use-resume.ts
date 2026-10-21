import { openTabOf } from '@soromi/core'
import { useCallback, useEffect, useRef } from 'react'

//Constants
import { CONVERSATIONS } from '../constants/conversations'

//Services
import { LinkService } from '@/services/link'

//Type
import type { PastConversation } from '@soromi/protocol'

/**
 * Carries an earlier conversation on: in the session that already shows it, or in one the
 * computer opens for it, with its history. `onOpened` is told which, once there is one to go to.
 */
export const useResume = (workspace: string, onOpened: (session: string) => void) => {
  // A conversation was asked to be resumed, and the session the computer opens for it is due.
  const waiting = useRef(false)

  // The computer says which session it opened to the device that asked, and to it alone.
  useEffect(
    () =>
      LinkService.onMessage((message) => {
        if (!waiting.current || message.type !== 'session-opened') return
        if (message.workspace !== workspace) return
        waiting.current = false
        onOpened(message.session.id)
      }),
    [workspace, onOpened],
  )

  return useCallback(
    (conversation: PastConversation) => {
      const tab = openTabOf(conversation)
      if (tab) {
        onOpened(tab)
        return
      }
      waiting.current = true
      LinkService.send({
        type: 'resume-conversation',
        workspace,
        conversation: conversation.id,
        agent: conversation.agent,
        account: conversation.account,
        mode: CONVERSATIONS.mode,
      })
    },
    [workspace, onOpened],
  )
}
