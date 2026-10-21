import type { FileKind, FileNode } from '@soromi/core'

//Components
import type { HighlightLine, IconName, SegmentedOption } from '@/components'

//Type
import type { FileContent } from '@/states/workspace/workspace.state.type'

export type TreeProps = {
  workspace: string
}

export type TreeRowProps = {
  workspace: string
  node: FileNode
  /** A long press asks for what can be done with the row. */
  onMenu: (node: FileNode) => void
}

export type FileIconProps = {
  /** The file's name, which decides its icon and colour. */
  name: string
}

/** How a file is drawn in the tree. */
export type FileIconLook = {
  icon: IconName
  color: string
}

export type PathMenuProps = {
  workspace: string
  /** The file or folder the menu is about, or `null` while it is closed. */
  node: FileNode | null
  onClose: () => void
}

/** Which of a file's paths to copy. */
export type PathKind = 'absolute' | 'relative'

/** One line of a file, numbered from 1. */
export type CodeLine = {
  key: string
  number: number
  text: string
  /** The line in colour, when the file is in a language the phone colours. */
  tokens: HighlightLine | null
}

export type CodeProps = {
  /** The file's path, which says what language it is in. */
  path: string
  content: string
  /** The file is longer than what was sent. */
  truncated: boolean
}

export type LineProps = {
  line: CodeLine
}

export type FileViewProps = {
  workspace: string
  path: string
  file: FileContent
}

/** How a document is shown: drawn as a page, or as its source. */
export type FileMode = 'preview' | 'raw'

/** What the toolbar says of the file: where a save stands, or why it cannot be edited. */
export type FileStatus = 'saved' | 'unsaved' | 'saving' | 'failed' | 'offline' | 'large'

export type ToolbarProps = {
  /** The file is a document, which is offered both drawn and as source. */
  document: boolean
  mode: FileMode
  /** Shown beside the buttons; `null` when there is nothing to say. */
  status: FileStatus | null
  editing: boolean
  /** Whether the file can be edited at all. */
  editable: boolean
  /** Whether there is anything to save. */
  dirty: boolean
  onMode: (mode: string) => void
  onEdit: () => void
  onSave: () => void
  onDone: () => void
}

export type EditorProps = {
  value: string
  onChange: (text: string) => void
}

export type FilesConfig = {
  /** The icon each kind of file is drawn with. Its colour comes with the kind. */
  icons: Record<FileKind, IconName>
  /** The side of a row's folder or file icon, in points. */
  iconSize: number
  /** The side of the arrow that says whether a folder is open. */
  chevronSize: number
  /** How far each level of the tree is set in. */
  indent: number
  /** File extensions drawn as a formatted document instead of as source. */
  markdown: string[]
  /** What a long press on a row offers, by the path it copies. */
  menu: Record<PathKind, string>
  /** Moving a file or folder to the computer's Trash, after asking. */
  trash: {
    action: string
    hint: string
    title: Record<FileNode['type'], string>
    message: Record<FileNode['type'], (name: string) => string>
    cancel: string
    confirm: string
  }
  /** The ways a document is shown, in the order they are offered. */
  modes: Array<SegmentedOption & { id: FileMode }>
  edit: {
    /** The longest file offered for editing: a text box holding more than this is too slow to type in. */
    maxChars: number
    /** How long a save may go unanswered before it is taken to have failed. */
    timeoutMs: number
    edit: string
    save: string
    done: string
    /** Asked before leaving the editor with changes that were not saved. */
    discard: {
      title: string
      message: string
      keep: string
      confirm: string
    }
  }
  status: Record<FileStatus, string>
  copy: {
    empty: string
    binary: string
    /** In place of a picture the computer would not send, being too large. */
    largePicture: string
    truncated: string
  }
}
