//Constants
import { CONVERSATIONS } from './constants/conversations'

//Type
import type { PastConversation } from '@soromi/protocol'

/** One conversation is told from another by its account and its id: two logins can share an id. */
export const getConversationKey = (conversation: PastConversation): string =>
  `${conversation.account}:${conversation.id}`

/** What is said under the search box: what picking one does, or how many a search found. */
export const getCaption = (query: string | null, found: number): string => {
  if (!query) return CONVERSATIONS.hint
  if (found === 0) return ''
  const { one, many, limit } = CONVERSATIONS.found
  if (found >= CONVERSATIONS.limit) return `The ${found} ${limit} “${query}”`

  return found === 1 ? `${one} “${query}”` : `${found} ${many} “${query}”`
}

/** What is said in place of the list when there is nothing in it. */
export const getEmptyText = (query: string | null): string =>
  query ? `${CONVERSATIONS.none} “${query}”.` : CONVERSATIONS.empty
