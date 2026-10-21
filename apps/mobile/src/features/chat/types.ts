import type { ChatRow, ToolDiffLine, ToolItem, ToolState } from '@soromi/core'
import type { ReactNode } from 'react'
import type {
  ChatFile,
  PermissionMode,
  QueuedTurn,
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

export type QueueProps = {
  session: string
  /** The messages queued, oldest first; none while there are none. */
  queued: QueuedTurn[] | undefined
  /** A stop holds them back. */
  paused: boolean
  /** Only the device in control, while the link is up, can send or remove one. */
  enabled: boolean
}

export type QueuedLineProps = {
  session: string
  turn: QueuedTurn
  enabled: boolean
}

export type AgentLineProps = {
  /** The session it works for, whose log screen a tap opens. */
  session: string
  agent: SubAgent
  /** Now, in whole seconds, so every line counts from the same tick. */
  now: number
}

export type AgentLogNoteProps = {
  loaded: boolean
  running: boolean
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

export type OpenPictureProps = {
  file: ChatFile
  /** How it is drawn in the conversation: a tile beside a message's others, or a panel as wide as
   * the row (what a tool returned). */
  size: 'tile' | 'panel'
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
  /** Under the box, above the home indicator: the workspace's usage. */
  footer?: ReactNode
}

export type EarlierProps = {
  session: string
  /** How many events are loaded, which is where the next page ends. */
  loaded: number
}

export type EmptyProps = {
  chat: boolean
}

export type ResultImageProps = {
  file: ChatFile
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
/** Where an attachment comes from: the photo library, the camera, or the phone's files. */
export type AttachSource = 'library' | 'camera' | 'files'

export type AttachSheetProps = {
  visible: boolean
  onSelect: (source: AttachSource) => void
  onClose: () => void
}

export type AttachLimit = {
  /** How many attachments: pictures and files together. */
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
    /** In place of the placeholder while the agent works, when a message waits for its turn. */
    queue: string
    /** In place of the placeholder while another device is in control. */
    watching: string
    send: string
    /** What the send button does while the agent works, for a screen reader. */
    queued: string
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
    /** Above where an attachment comes from. */
    title: string
    /**
     * How long the sheet takes to go: the system's picker or camera does not come up on iOS while
     * something else is still leaving the screen.
     */
    pickDelayMs: number
    sources: Record<AttachSource, { label: string; hint?: string }>
    /** Said when no more fit in the message. */
    full: Notice
    /** Said when some of those picked were too large to go together. */
    dropped: Notice
    /** Said when some files picked are not something the agent can read. */
    unsupported: Notice
    /** Said when the camera is not allowed. */
    camera: Notice
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
  /** The messages queued over the box. */
  queue: {
    /** Over one queued message, and after the count over more. */
    one: string
    many: string
    /** Over them while a stop holds them back. */
    paused: string
    /** In place of the text of one sent with pictures alone. */
    attachments: string
    send: string
    remove: string
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
    /** What a tap on an agent does, for a screen reader. */
    open: string
    /** Its own log, on a screen of its own. */
    log: {
      loading: string
      /** It has written nothing yet. */
      starting: string
      /** It is over and wrote nothing. */
      none: string
      /** Above a log that goes back further than what was sent. */
      earlier: string
      /** Under its name: still at work, or done. */
      running: string
      finished: string
    }
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
    /** For a screen reader: what a tap on a picture does, and what one with no name is. */
    open: string
    picture: string
    /** The side of a picture in a message, in points. */
    thumb: number
    /** The height of a picture a tool returned: large enough to look at. */
    result: number
    /** What a file with no name is called. */
    unnamed: string
  }
  row: {
    earlier: string
    interrupted: string
  }
}
