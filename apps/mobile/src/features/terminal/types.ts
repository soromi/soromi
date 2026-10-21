//Components
import type { SegmentedOption } from '@/components'

//Type
import type { ShellSummary } from '@soromi/protocol'

/** How a session that runs in a terminal is shown: what was said in it, or the terminal itself. */
export type TerminalView = 'conversation' | 'terminal'

/** A key the on-screen keyboard does not have, offered above it. */
export type TerminalKey = {
  id: string
  /** What the key shows. */
  label: string
  /** What pressing it sends to the terminal. */
  data: string
}

export type PaneProps = {
  /** A session's id, or a shell's. */
  session: string
}

export type ShellsProps = {
  workspace: string
}

export type ShellTabProps = {
  shell: ShellSummary
  /** The one on screen: it is marked, and is the one that can be closed. */
  active: boolean
  onSelect: (id: string) => void
  onClose: (id: string) => void
  /** On a long press: to give it another name. */
  onRename: (id: string) => void
}

export type RenameShellProps = {
  /** The terminal being renamed; `null` while none is. */
  target: ShellSummary | null
  onClose: () => void
}

export type NewShellProps = {
  workspace: string
  /** With the folder to start in, relative to the workspace. */
  onOpen: (folder: string) => void
}

/** A folder a new terminal can start in. */
export type FolderChoice = {
  folder: string
  label: string
}

export type KeysProps = {
  onSend: (data: string) => void
}

export type KeyProps = {
  item: TerminalKey
  onSend: (data: string) => void
}

/** The terminal's size, in character cells. */
export type TerminalSize = {
  cols: number
  rows: number
}

export type TerminalConfig = {
  /** The views of a terminal session, in the order they are offered. */
  views: Array<SegmentedOption & { id: TerminalView }>
  /** The one such a session opens on. */
  initial: TerminalView
  keys: TerminalKey[]
  /** The terminals of a workspace: plain shells, as in the desktop's Terminal tab. */
  shells: {
    /** In place of a terminal, while none is open. */
    empty: string
    /** What the button that opens one does, for a screen reader. */
    add: string
    close: string
    /** Over the box a terminal's new name is typed in. */
    rename: string
    /** What a long press on one does, for a screen reader. */
    renameHint: string
    /** In that box, while it is empty. */
    name: string
    save: string
    /** Over the folders a new one can start in. */
    pick: string
    /** What the top of the workspace is called among them. */
    root: string
  }
}
