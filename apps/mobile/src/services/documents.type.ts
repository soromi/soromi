//Type
import type { Attachment } from '@/states/chat/chat.state.type'

export type DocumentsConfig = {
  /** Types the agent reads as they are: a PDF as a document, a picture as one. */
  passed: string[]
  /** Types that are text, whatever the system calls them. */
  textTypes: string[]
  /** Extensions of text files the system has no text type for (code, notes, logs). */
  textExtensions: string[]
  /** What a text file is sent as when the system calls it something else. */
  textType: string
}

/** What came of picking files: those that can go with a message, and how many cannot. */
export type PickedDocuments = {
  accepted: Attachment[]
  unsupported: number
}
