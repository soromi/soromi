import type { ReactNode } from 'react'

//Type
import type { SegmentedOption } from '@/components'

/** A value to pick, with what it is called. */
export type Choice = {
  value: string
  label: string
}

export type FieldProps = {
  label: string
  /** A line under the label: what the setting does. */
  hint?: string
  children: ReactNode
}

export type SwitchRowProps = {
  label: string
  /** Under it: what turning it on does. */
  hint?: string
  value: boolean
  onChange: (value: boolean) => void
}

export type AddAccountProps = {
  agent: string
  /** The accounts it could be bound to besides. */
  spare: string[]
  onAdd: (agent: string, account: string) => void
}

export type SaveBarProps = {
  /** The computer is saving it. */
  pending: boolean
  /** Why the computer could not, when it could not. */
  error: string | null
  /** Whether what is set can be saved at all: a workspace needs a folder. */
  valid: boolean
  onSave: () => void
  onDiscard: () => void
}

/** The parts of a workspace's settings, one on screen at a time. */
export type SettingsTab = 'general' | 'agents' | 'advanced'

export type ChoiceFieldProps = {
  /** What the sheet is titled: what is being chosen. */
  title: string
  value: string
  choices: Choice[]
  /** Before the value on the chip: a provider's mark, say. */
  leading?: ReactNode
  disabled?: boolean
  onChange: (value: string) => void
}

export type FoldersFieldProps = {
  /** The folders chosen, absolute. */
  folders: string[]
  onChange: (folders: string[]) => void
}

export type ChosenFolderProps = {
  path: string
  onRemove: (path: string) => void
}

export type FolderPickerProps = {
  visible: boolean
  /** A folder was chosen: its absolute path. */
  onPick: (path: string) => void
  onClose: () => void
}

export type FolderEntryProps = {
  name: string
  /** Its absolute path, which a tap opens. */
  path: string
  onOpen: (path: string) => void
}

export type AgentAccountsProps = {
  agent: string
  /** The accounts it is bound to, in order. */
  chosen: string[]
  /** The accounts it could be bound to besides. */
  spare: string[]
  onAdd: (agent: string, account: string) => void
  onRemove: (agent: string, account: string) => void
}

export type AccountRowProps = {
  agent: string
  account: string
  /** The agent's first account: the one its sessions start under. */
  first: boolean
  /** Whether it can be taken off: an agent keeps at least one account. */
  removable: boolean
  onRemove: (agent: string, account: string) => void
}

export type WorkspacesConfig = {
  /** What the ways in say, for a screen reader. */
  open: { create: string; settings: string }
  create: {
    title: string
    about: string
    name: string
    namePlaceholder: string
    folders: string
    agent: string
    account: string
    submit: string
    pending: string
    importFile: string
    importHint: string
  }
  folders: {
    add: string
    none: string
    remove: string
    picker: {
      title: string
      up: string
      use: string
      empty: string
      loading: string
      enter: string
    }
  }
  settings: {
    title: string
    /** The parts it is in, as the tabs at its top. */
    tabs: Array<SegmentedOption & { id: SettingsTab }>
    name: string
    folders: string
    foldersHint: string
    agents: string
    agentsHint: string
    /** Beside an agent's first account. */
    defaultAccount: string
    addAccount: string
    removeAccount: string
    instructions: string
    instructionsHint: string
    instructionsPlaceholder: string
    notifications: string
    notify: string
    notifyHint: string
    /** What the save bar says, and its buttons. */
    unsaved: string
    discard: string
    save: string
    pending: string
    share: string
    export: string
    exportHint: string
    exported: (path: string) => string
    danger: string
    remove: string
    removeHint: string
    confirm: { title: string; message: string; cancel: string; confirm: string }
    missing: string
  }
}
