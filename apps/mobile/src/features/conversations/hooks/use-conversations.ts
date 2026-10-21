import { CONVERSATION_SEARCH_MS, conversationQuery, isStaleList } from '@soromi/core'
import { useEffect } from 'react'

//Services
import { LinkService } from '@/services/link'

//State
import { useDaemonConversations } from '@/states/daemon/daemon.state.hook'

/**
 * A workspace's earlier conversations, asked for when the screen opens and again whenever the
 * link comes back; with `text`, the ones that mention it, asked for once the typing stops (the
 * computer reads every conversation for a search). `waiting` while the answer to the search as it
 * stands has not come yet.
 */
export const useConversations = (workspace: string, text: string) => {
  const held = useDaemonConversations(workspace)
  const query = conversationQuery(text)

  useEffect(() => {
    const ask = () =>
      LinkService.send({ type: 'list-conversations', workspace, ...(query ? { query } : {}) })
    const timer = setTimeout(ask, query ? CONVERSATION_SEARCH_MS : 0)
    const stop = LinkService.onOpen(ask)

    return () => {
      clearTimeout(timer)
      stop()
    }
  }, [workspace, query])

  return {
    query,
    list: held?.list,
    loaded: held !== undefined,
    waiting: isStaleList(held, query),
  }
}
