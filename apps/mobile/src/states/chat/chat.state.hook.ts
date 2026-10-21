//State
import { ChatStore } from './chat.state'

/**
 * @description When a session's running turn was first seen, or `undefined` when none is running
 */
export const useChatTurnStart = (session: string) =>
  ChatStore((state) => state.turns.startedAt[session])

/**
 * @description The message being written for a session
 */
export const useChatDraft = (session: string) =>
  ChatStore((state) => state.drafts.text[session] ?? '')

/**
 * @description The pictures picked for a session's next message, or `undefined` when there are none
 */
export const useChatAttachments = (session: string) =>
  ChatStore((state) => state.attachments.files[session])

/**
 * @description Chat actions: a stable reference, so no shallow compare needed
 */
export const useChatActions = () => ChatStore((state) => state.actions)
