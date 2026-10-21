//Types
import type { PastConversation } from '@soromi/protocol'

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/** How long a search waits for the typing to stop before it is sent: the daemon reads every file. */
export const CONVERSATION_SEARCH_MS = 300

/**
 * When an earlier conversation was last added to, as a list says it: "just now", "5m ago",
 * "3h ago", "yesterday", "4d ago", then the date ("Mar 3", with the year when it is not this one).
 * `updated` and `now` are Unix seconds.
 */
export function conversationAge(updated: number, now: number): string {
  const seconds = Math.max(0, now - updated)
  if (seconds < 60) return 'just now'
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`
  if (seconds < 86_400) return `${Math.floor(seconds / 3600)}h ago`
  const days = Math.floor(seconds / 86_400)
  if (days === 1) return 'yesterday'
  if (days < 7) return `${days}d ago`
  const date = new Date(updated * 1000)
  const day = `${MONTHS[date.getMonth()]} ${date.getDate()}`

  return date.getFullYear() === new Date(now * 1000).getFullYear()
    ? day
    : `${day}, ${date.getFullYear()}`
}

/**
 * The search as it is sent: trimmed, and `null` when there is nothing to look for, which asks for
 * the whole list. Also what a reply is matched against, to tell the latest from an older one.
 */
export function conversationQuery(text: string): string | null {
  const query = text.trim()

  return query ? query : null
}

/** The ones a search is still waiting on, or an answer to a search that has since changed. */
export function isStaleList(
  held: { query: string | null } | undefined,
  query: string | null,
): boolean {
  return !held || held.query !== query
}

/** The tab a conversation is already open in, or `null` when resuming it opens one. */
export function openTabOf(conversation: PastConversation): string | null {
  return conversation.session ?? null
}
