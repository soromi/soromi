//State
import { create } from '../create'

//Type
import type { ChatType } from './chat.state.type'

/**
 * What the phone itself keeps about conversations, apart from what the daemon streams.
 *
 * - When a running turn was first seen, so its clock keeps counting across leaving the screen and
 *   coming back. The daemon owns the turn; it does not say when it began.
 * - The message being written for each session, so it survives leaving the screen, and so another
 *   screen (the skills list) can put something in it.
 * - The pictures picked to go with it. They are held in memory only, and go when the message does.
 */
export const ChatStore = create<ChatType>()((set) => ({
  turns: { startedAt: {} },
  drafts: { text: {} },
  attachments: { files: {} },
  actions: {
    setDraft: (session, text) =>
      set((state) => ({ drafts: { text: { ...state.drafts.text, [session]: text } } })),
    addAttachments: (session, attachments) =>
      set((state) => {
        const held = state.attachments.files[session] ?? []
        const added = attachments.filter((next) => !held.some((one) => one.uri === next.uri))
        if (added.length === 0) return state

        return {
          attachments: { files: { ...state.attachments.files, [session]: [...held, ...added] } },
        }
      }),
    removeAttachment: (session, uri) =>
      set((state) => {
        const held = state.attachments.files[session]
        if (!held) return state
        const files = {
          ...state.attachments.files,
          [session]: held.filter((one) => one.uri !== uri),
        }

        return { attachments: { files } }
      }),
    clearAttachments: (session) =>
      set((state) => {
        if (state.attachments.files[session] === undefined) return state
        const { [session]: _sent, ...files } = state.attachments.files

        return { attachments: { files } }
      }),
    startTurn: (session) =>
      set((state) =>
        state.turns.startedAt[session] === undefined
          ? { turns: { startedAt: { ...state.turns.startedAt, [session]: Date.now() } } }
          : state,
      ),
    endTurn: (session) =>
      set((state) => {
        if (state.turns.startedAt[session] === undefined) return state
        const { [session]: _ended, ...startedAt } = state.turns.startedAt

        return { turns: { startedAt } }
      }),
  },
}))
