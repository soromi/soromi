import type { ChatFile } from '@soromi/protocol'

export type ChatTurns = {
  /** When this phone first saw each running turn, by session id (Unix milliseconds). */
  startedAt: Record<string, number>
}

export type ChatDrafts = {
  /** What is written and not yet sent, by session id. */
  text: Record<string, string>
}

/** A picture picked to go with the next message. */
export type Attachment = {
  /** Where the picture is on the phone: what it is shown from, and what tells two apart. */
  uri: string
  /** What is sent to the agent. */
  file: ChatFile
}

export type ChatAttachments = {
  /** What is picked and not yet sent, by session id. */
  files: Record<string, Attachment[]>
}

export type ChatActions = {
  setDraft: (session: string, text: string) => void
  /** Adds pictures to a session's next message. One already there is not added twice. */
  addAttachments: (session: string, attachments: Attachment[]) => void
  removeAttachment: (session: string, uri: string) => void
  /** The message went: nothing is left to send with the next one. */
  clearAttachments: (session: string) => void
  /** A session is mid-turn. The first sighting sets its clock; later ones leave it be. */
  startTurn: (session: string) => void
  /** The turn is over: its clock is dropped. */
  endTurn: (session: string) => void
}

export type ChatType = {
  turns: ChatTurns
  drafts: ChatDrafts
  attachments: ChatAttachments
  /** Grouped so the object stays reference-stable: `useChatActions` needs no shallow compare. */
  actions: ChatActions
}
