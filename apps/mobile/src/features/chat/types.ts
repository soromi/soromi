import type { ChatRow, ToolDiffLine, ToolItem, ToolState } from '@soromi/core'
import type {
  ChatFile,
  PermissionMode,
  Status,
  SubAgent,
  ToolApproval,
  ToolKind,
} from '@soromi/protocol'

//Components
import type { IconName } from '@/components'

//Type
import type { Attachment } from '@/states/chat/chat.state.type'

export type RowProps = {
  /** One line of the conversation, as the desktop draws it too (see `buildRows` in `@soromi/core`). */
  row: ChatRow
}

export type ToolProps = {
  tool: ToolItem
}

export type ToolBodyProps = {
  tool: ToolItem
  /** The call's diff, when it is an edit. */
  diff: ToolDiffLine[] | null
}

export type ToolGroupProps = {
  tools: ToolItem[]
}

export type ReasoningProps = {
  text: string
}

export type AgentsProps = {
  session: string
  /** The agents at work; none while the daemon has listed none. */
  agents: SubAgent[] | undefined
  /** Only the device in control can stop what the agent is doing. */
  enabled: boolean
}

export type AgentLineProps = {
  agent: SubAgent
  /** Now, in whole seconds, so every line counts from the same tick. */
  now: number
}

export type ContextProps = {
  session: string
  /** The provider the session runs, which with its model decides how large the window is. */
  agent: string
  model: string | null
  /** How much of the window the conversation fills, when the daemon has said. */
  tokens: number | null
  /** Whether the actions can be taken: this phone is in control, online, and no turn is running. */
  enabled: boolean
}

export type SlashMenuProps = {
  session: string
  /** What is written in the message box. */
  draft: string
}

export type MessageFilesProps = {
  files: ChatFile[]
}

export type MessageImageProps = {
  file: ChatFile
}

/** Lines of a tool's body or output, cut to what is worth drawing, with how many were left out. */
export type Clipped<T> = {
  shown: T[]
  hidden: number
}

export type ApprovalProps = {
  session: string
  approval: ToolApproval
  /** Only the device in control can answer. */
  enabled: boolean
}

export type ComposerProps = {
  session: string
  /** A chat session takes messages; a terminal session can only be followed. */
  chat: boolean
  /** The agent is mid-turn: offer to stop it instead of sending. */
  working: boolean
  inControl: boolean
  online: boolean
}

export type EarlierProps = {
  session: string
  /** How many events are loaded, which is where the next page ends. */
  loaded: number
}

export type EmptyProps = {
  chat: boolean
}

export type PanelActionProps = {
  onPress: () => void
}

export type ToolbarProps = {
  session: string
  /** Whether this phone can change anything: it is in control, and the link is up. */
  enabled: boolean
  working: boolean
  /** There is something to send. */
  filled: boolean
  onAttach: () => void
  onSend: () => void
  onStop: () => void
}

export type ModelPickerProps = {
  session: string
  /** The provider the session runs, which decides the models on offer. */
  agent: string
  /** The session's model, or `null` for the provider's default. */
  model: string | null
  /** The session's reasoning effort, or `null` for the provider's default. */
  effort: string | null
  enabled: boolean
}

export type PermissionPickerProps = {
  session: string
  mode: PermissionMode
  enabled: boolean
}

export type AgentPickerProps = {
  session: string
  agent: string
  /** The account the session runs under. */
  account: string
  enabled: boolean
}

export type AttachmentsProps = {
  session: string
  attachments: Attachment[]
}

export type AttachmentProps = {
  session: string
  attachment: Attachment
}

/** How much can go with one message. */
export type AttachLimit = {
  /** How many pictures. */
  limit: number
  /** How large they can be together, as sent (base64 characters). */
  maxEncoded: number
}

/** Which of the pictures just picked go with the message, and how many did not fit. */
export type AttachFit = {
  accepted: Attachment[]
  dropped: number
}

type Notice = {
  title: string
  message: string
}

export type WorkingProps = {
  /** When the turn was first seen (Unix milliseconds), or `null` to count from now. */
  since: number | null
  /** How much of the model's context the conversation fills, when the daemon has said. */
  tokens: number | null
}

export type ChatConfig = {
  empty: {
    chat: string
    terminal: string
  }
  composer: {
    placeholder: string
    /** In place of the placeholder while another device is in control. */
    watching: string
    send: string
    stop: string
    attach: string
    /** In place of the box, for a session that runs in a terminal. */
    terminal: string
    /** How tall the box grows before it scrolls. */
    maxHeight: number
  }
  attach: AttachLimit & {
    /** The side of a picture's preview, in points. */
    thumb: number
    remove: string
    /** Said when no more pictures fit in the message. */
    full: Notice
    /** Said when some of the pictures picked were too large to go together. */
    dropped: Notice
    ok: string
  }
  model: {
    title: string
    effort: string
    /** What stands for the provider's default model, which has no name of its own to send. */
    defaultKey: string
  }
  permission: {
    title: string
  }
  agent: {
    title: string
    /** Asked before switching: it starts the conversation over. */
    confirm: {
      title: string
      /** Before the agent's name. */
      lead: string
      /** After it. */
      trail: string
      cancel: string
      confirm: string
    }
  }
  approval: {
    lead: string
    trail: string
    allow: string
    deny: string
    /** How much of what is being approved is shown. */
    bodyLines: number
  }
  /** The header's way to a session's files and skills, for a screen reader. */
  panel: string
  working: {
    separator: string
    /** Before the token count: it is what the turn has taken in. */
    arrow: string
    tokens: string
    /** How often the clock moves on, in milliseconds. */
    tickMs: number
  }
  tool: {
    /** The icon each kind of tool call is drawn with. */
    icons: Record<ToolKind, IconName>
    /** A call's state as the dot at the end of its row, in the colours a session's status uses. */
    dots: Record<ToolState, Status>
    /** Before a command, in its opened body. */
    prompt: string
    /** Before the count of lines an edit added, and of those it removed. */
    added: string
    removed: string
    /** How tall an opened body grows before it scrolls. */
    maxHeight: number
    /** How many lines of a body are drawn; the rest are counted, not shown. */
    maxLines: number
    more: string
  }
  reasoning: {
    /** The heading of the agent's reasoning, which opens to show it. */
    label: string
  }
  agents: {
    /** After the count, for one agent and for more. */
    one: string
    many: string
    show: string
    hide: string
    stop: string
    /** After the minutes and the seconds an agent has run for. */
    minutes: string
    seconds: string
  }
  context: {
    /** Before and after how full the window is. */
    lead: string
    trail: string
    compact: string
    clear: string
    dismiss: string
    /** What each action sends the agent. */
    commands: { compact: string; clear: string }
    /** Asked before clearing: it cannot be undone. */
    confirm: Notice & { cancel: string; confirm: string }
  }
  slash: {
    /** Before a command's name. */
    prefix: string
    /** How tall the list of commands grows before it scrolls. */
    maxHeight: number
  }
  files: {
    /** The side of a picture in a message, in points. */
    thumb: number
    /** What a file with no name is called. */
    unnamed: string
  }
  row: {
    earlier: string
    interrupted: string
  }
}
