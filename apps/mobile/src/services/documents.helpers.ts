//Constants
import { DOCUMENTS } from './documents.constants'

/** A file's extension, lowercased, without the dot; a dotfile (`.env`) is its own extension. */
const extensionOf = (name: string): string => {
  const base = name.split('/').pop() ?? name
  const dot = base.lastIndexOf('.')

  return dot === -1 ? base.toLowerCase() : base.slice(dot + 1).toLowerCase()
}

/**
 * What a picked file is sent to the agent as, or `null` for one it cannot read: a PDF or a picture
 * as itself, and text as text, whether the system calls it that (`text/markdown`, `application/json`)
 * or only its name says so (`main.rs`).
 */
export const toDocumentType = (name: string, mimeType: string | undefined): string | null => {
  const type = (mimeType ?? '').toLowerCase()
  if (DOCUMENTS.passed.includes(type) || type.startsWith('image/')) return type
  if (type.startsWith('text/')) return type
  if (DOCUMENTS.textTypes.includes(type)) return DOCUMENTS.textType
  if (DOCUMENTS.textExtensions.includes(extensionOf(name))) return DOCUMENTS.textType

  return null
}
