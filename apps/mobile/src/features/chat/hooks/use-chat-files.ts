import { deferredFiles } from '@soromi/core'
import { useEffect, useRef, useState } from 'react'

//Helpers
import { getFetchKey } from '../helpers'

//Services
import { LinkService } from '@/services/link'

//State
import { useDaemonChat, useDaemonChatCursor } from '@/states/daemon/daemon.state.hook'

/**
 * Chat events come without the bytes of the files attached to them. This asks for the ones in the
 * messages that are loaded, once the conversation is on screen. Each is asked for once per
 * connection: an answer lost to a dropped link is asked for again on the next.
 */
export const useChatFiles = (session: string) => {
  const events = useDaemonChat(session)
  const cursor = useDaemonChatCursor(session)
  const asked = useRef(new Set<string>())
  // Counts the connections, so the asking starts over on each.
  const [link, setLink] = useState(0)

  useEffect(
    () =>
      LinkService.onOpen(() => {
        asked.current = new Set()
        setLink((count) => count + 1)
      }),
    [],
  )

  // biome-ignore lint/correctness/useExhaustiveDependencies: a new connection is a reason to ask again.
  useEffect(() => {
    if (!events || !cursor) return
    for (const file of deferredFiles({ events, cursor })) {
      const key = getFetchKey(cursor.log, file.seq, file.index)
      if (asked.current.has(key)) continue
      asked.current.add(key)
      LinkService.send({
        type: 'chat-fetch-file',
        session,
        log: cursor.log,
        seq: file.seq,
        index: file.index,
      })
    }
  }, [events, cursor, session, link])
}
