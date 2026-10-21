import { buildRows, formatElapsed, formatTokens } from '@soromi/core'

//Config
import { routes } from '@/config/router'

//Constants
import { CHAT } from './constants/chat'

//Type
import type { AgentOption, ChatRow, ModelOption, ProviderModels, ToolDiffLine } from '@soromi/core'
import type { ChatEvent, ChatFile } from '@soromi/protocol'
import type { Href } from 'expo-router'
import type { Attachment } from '@/states/chat/chat.state.type'
import type { AttachFit, AttachLimit, Clipped } from './types'

/**
 * The conversation as the rows to draw, newest first: the list is inverted, which keeps it pinned
 * to the latest message. The rows are the desktop's (tool calls folded with their results, a long
 * run of them as one group); the reply still streaming in is added as the newest message.
 */
export const toRows = (events: ChatEvent[] | undefined, streaming: string): ChatRow[] => {
  const rows = buildRows(events ?? [])
  if (streaming) rows.push({ key: 'streaming', kind: 'assistant', text: streaming })

  return rows.reverse()
}

export const getRowKey = (row: ChatRow): string => row.key

/** The first `limit` of some lines, and how many there were beyond that. */
export const clip = <T>(lines: T[], limit: number): Clipped<T> => ({
  shown: lines.length > limit ? lines.slice(0, limit) : lines,
  hidden: Math.max(0, lines.length - limit),
})

/** "+ 12 more lines", under a body that was cut. */
export const getMoreLabel = (hidden: number): string =>
  `${CHAT.tool.added} ${hidden} ${CHAT.tool.more}`

/** A diff line as it is drawn: its sign, then its text. Lines kept as they were get a space. */
export const getDiffText = (line: ToolDiffLine): string =>
  `${line.sign === '-' ? CHAT.tool.removed : line.sign} ${line.text}`

/** A system notice as the daemon wrote it, without the brackets some come wrapped in. */
export const getNoticeText = (text: string): string =>
  text.replace(/^\[|\]$/g, '') || CHAT.row.interrupted

/** What follows the working word: " · 6s", and " · ↓ 519.1k tokens" once the count is known. */
export const getWorkingMeta = (elapsed: number, tokens: number | null): string => {
  const parts = [formatElapsed(elapsed)]
  if (tokens !== null && tokens > 0) {
    parts.push(`${CHAT.working.arrow} ${formatTokens(tokens)} ${CHAT.working.tokens}`)
  }

  return parts.map((part) => `${CHAT.working.separator}${part}`).join('')
}

/** Whole seconds from `since` to `now`, never negative. */
export const getElapsedSeconds = (since: number, now: number): number =>
  Math.max(0, Math.floor((now - since) / 1000))

/** Where a session's files and skills are shown. */
export const getPanelHref = (session: string): Href => ({
  pathname: routes.app.panel,
  params: { id: session },
})

/** Whether there is anything to send: something written, or a picture. */
export const hasMessage = (text: string, attachments: number): boolean =>
  text.trim() !== '' || attachments > 0

/** How large pictures are together, as sent. */
export const getEncodedSize = (attachments: Attachment[]): number =>
  attachments.reduce((total, one) => total + one.file.data.length, 0)

/**
 * Which of the pictures just picked can join the ones already held: in the order picked, for as
 * long as the count and the size they make together stay within what one message takes.
 */
export const fitAttachments = (
  held: Attachment[],
  picked: Attachment[],
  limit: AttachLimit,
): AttachFit => {
  const accepted: Attachment[] = []
  let size = getEncodedSize(held)
  for (const one of picked) {
    if (held.length + accepted.length >= limit.limit) break
    if (size + one.file.data.length > limit.maxEncoded) continue
    size += one.file.data.length
    accepted.push(one)
  }

  return { accepted, dropped: picked.length - accepted.length }
}

/** A model as a picker's value. The provider's default has no name, so it gets one here. */
export const toModelKey = (value: string | null): string => value ?? CHAT.model.defaultKey

/** The model a picker's value stands for, among those a provider lists. */
export const findModel = (models: ProviderModels, key: string): ModelOption | undefined =>
  models.models.find((option) => toModelKey(option.value) === key)

/** "Claude (work)": an agent and the account it runs under. */
export const getAgentName = (option: AgentOption): string =>
  `${option.label} (${option.accountLabel})`

/** What is asked before a chat is restarted under another agent. */
export const getSwitchMessage = (option: AgentOption): string =>
  `${CHAT.agent.confirm.lead}${getAgentName(option)}${CHAT.agent.confirm.trail}`

/** "3 agents working in the background". */
export const getAgentsLabel = (count: number): string =>
  `${count} ${count === 1 ? CHAT.agents.one : CHAT.agents.many}`

/** How long an agent has run: "48s", "1m 12s". */
export const getAgentElapsed = (startedAt: number, now: number): string => {
  const total = Math.max(0, now - startedAt)
  const minutes = Math.floor(total / 60)
  const seconds = total % 60

  return minutes > 0
    ? `${minutes}${CHAT.agents.minutes} ${String(seconds).padStart(2, '0')}${CHAT.agents.seconds}`
    : `${seconds}${CHAT.agents.seconds}`
}

/** "Context is 84% full. …" */
export const getContextMessage = (percent: number): string =>
  `${CHAT.context.lead}${percent}${CHAT.context.trail}`

/** Whether a file attached to a message is a picture that can be drawn. */
export const isImage = (file: ChatFile): boolean => file.mediaType.startsWith('image/')

/** A file's bytes as an address a picture can be drawn from; `null` while they have not arrived. */
export const getImageUri = (file: ChatFile): string | null =>
  file.data ? `data:${file.mediaType};base64,${file.data}` : null

/** What a deferred file is asked for under, once per connection. */
export const getFetchKey = (log: string, seq: number, index: number): string =>
  `${log}:${seq}:${index}`
