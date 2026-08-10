import { memo } from 'react'

//Components
import { Markdown } from './markdown'
import { Reasoning } from './reasoning'
import { ToolCall } from './tool-call'
import { ToolGroup } from './tool-group'

//Types
import type { Row } from './rows'

/**
 * One conversation row: a tool card, a folded tool group, a reasoning block, a system notice, or a
 * text bubble (user) / plain markdown (assistant).
 *
 * Memoized: `rows` (and each `row` object) are referentially stable while a turn streams — only the
 * live delta changes, not `events` — so a re-render of `ChatView` (which happens on every delta, since
 * `streaming` is a prop) skips every committed row instead of re-parsing all their markdown.
 */
export const ChatRow = memo(function ChatRow({ row }: { row: Row }) {
  if (row.kind === 'tool') {
    return <ToolCall {...row.tool} />
  }
  if (row.kind === 'tool-group') {
    return <ToolGroup tools={row.tools} />
  }
  if (row.kind === 'thinking') {
    return <Reasoning text={row.text} />
  }
  if (row.kind === 'notice') {
    // A system event (e.g. a stopped turn), tagged by the daemon — a centered marker, not a bubble.
    return (
      <div className="my-1 flex items-center justify-center gap-2.5 text-[11.5px] text-[var(--soromi-text-faint)]">
        <span className="h-px w-8 bg-[var(--soromi-border)]" />
        {row.text.replace(/^\[|\]$/g, '') || 'Interrupted'}
        <span className="h-px w-8 bg-[var(--soromi-border)]" />
      </div>
    )
  }
  if (row.kind === 'user') {
    return (
      <div className="max-w-[85%] self-end rounded-2xl bg-[var(--soromi-bg-active)] px-3.5 py-2">
        <Markdown>{row.text}</Markdown>
      </div>
    )
  }
  return <Markdown>{row.text}</Markdown>
})
