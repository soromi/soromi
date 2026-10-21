import { useCallback } from 'react'
import { Alert } from 'react-native'

//Constants
import { CHAT } from '../constants/chat'

//Helpers
import { fitAttachments } from '../helpers'

//Services
import { PhotoService } from '@/services/photos'

//State
import { useChatActions, useChatAttachments } from '@/states/chat/chat.state.hook'

/**
 * The pictures going with a session's next message, and how to pick more. What does not fit in
 * one message is left out, and the user is told.
 */
export const usePhotos = (session: string) => {
  const attachments = useChatAttachments(session)
  const actions = useChatActions()

  const pick = useCallback(async () => {
    const held = attachments ?? []
    const room = CHAT.attach.limit - held.length
    if (room <= 0) {
      Alert.alert(CHAT.attach.full.title, CHAT.attach.full.message, [{ text: CHAT.attach.ok }])
      return
    }

    const picked = await PhotoService.pick(room)
    const fit = fitAttachments(held, picked, CHAT.attach)
    actions.addAttachments(session, fit.accepted)
    if (fit.dropped > 0) {
      Alert.alert(CHAT.attach.dropped.title, CHAT.attach.dropped.message, [
        { text: CHAT.attach.ok },
      ])
    }
  }, [attachments, actions, session])

  return { attachments, pick }
}
