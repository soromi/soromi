import { useCallback } from 'react'
import { Alert } from 'react-native'

//Constants
import { CHAT } from '../constants/chat'

//Helpers
import { fitAttachments } from '../helpers'

//Services
import { DocumentService } from '@/services/documents'
import { PhotoService } from '@/services/photos'

//State
import { useChatActions, useChatAttachments } from '@/states/chat/chat.state.hook'

//Type
import type { Attachment } from '@/states/chat/chat.state.type'
import type { AttachSource } from '../types'

/** Says something went with no answer to give but OK. */
const tell = (notice: { title: string; message: string }) =>
  Alert.alert(notice.title, notice.message, [{ text: CHAT.attach.ok }])

/**
 * What goes with a session's next message (pictures and files), and how to add more: from the
 * photo library, the camera, or the phone's files. What does not fit in one message, or is not
 * something the agent reads, is left out, and the user is told.
 */
export const useAttachments = (session: string) => {
  const attachments = useChatAttachments(session)
  const actions = useChatActions()

  const add = useCallback(
    async (source: AttachSource) => {
      const held = attachments ?? []
      const room = CHAT.attach.limit - held.length
      if (room <= 0) {
        tell(CHAT.attach.full)
        return
      }

      let picked: Attachment[] = []
      if (source === 'library') picked = await PhotoService.pick(room)
      if (source === 'camera') {
        const taken = await PhotoService.take()
        if (taken === 'denied') {
          tell(CHAT.attach.camera)
          return
        }
        picked = taken
      }
      if (source === 'files') {
        const found = await DocumentService.pick()
        if (found.unsupported > 0) tell(CHAT.attach.unsupported)
        picked = found.accepted
      }

      const fit = fitAttachments(held, picked, CHAT.attach)
      actions.addAttachments(session, fit.accepted)
      if (fit.dropped > 0) tell(CHAT.attach.dropped)
    },
    [attachments, actions, session],
  )

  return { attachments, add }
}
