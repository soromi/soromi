import type { PastConversation, SessionMode } from '@soromi/protocol'

export type ConversationRowProps = {
  conversation: PastConversation
  /** Now, in Unix seconds, so every row counts from the same moment. */
  now: number
  onSelect: (conversation: PastConversation) => void
}

export type ConversationsConfig = {
  title: string
  /** In the search box while it is empty. */
  search: string
  /** Under it, before anything is searched: what picking one does. */
  hint: string
  searching: string
  loading: string
  offline: string
  /** There are none to show, and none that mention a search (said with the search after it). */
  empty: string
  none: string
  /** How many a search found; `limit` when it found as many as it returns. */
  found: { one: string; many: string; limit: string }
  /** The most a search returns: the computer's limit. */
  limit: number
  /** In place of the account, for one a tab already shows. */
  open: string
  /** How a resumed conversation runs: a chat, as every session started from the phone. */
  mode: SessionMode
}
