import { useLayoutEffect, useMemo, useRef } from 'react'

//Components
import { ChatRow } from './chat-row'
import { WorkingIndicator } from './working-indicator'

//Logic
import { buildRows } from './rows'

//Types
import type { ChatEvent } from '@soromi/protocol'

export interface AgentLogViewProps {
  /** What the agent did, oldest first: its prompt, tool calls and results, and what it said. */
  events: ChatEvent[]
  /** The daemon has answered; until then the log is being looked for. */
  loaded: boolean
  /** The log goes back further than what is shown. */
  earlier: boolean
  /** The agent is still at work: a working line follows the log. */
  running: boolean
  /** When it started (Unix milliseconds), for the working line's clock. */
  since?: number | null
}

/** How close to the bottom counts as following along, in pixels. */
const FOLLOW_WITHIN = 80

/**
 * A background agent's own conversation, read-only, drawn as the chat draws its own: what it was
 * asked, then each tool call folded into a line and what it said. It keeps to the bottom while new
 * work comes in, unless it was scrolled up to read.
 */
export function AgentLogView({ events, loaded, earlier, running, since }: AgentLogViewProps) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const following = useRef(true)
  const rows = useMemo(() => buildRows(events), [events])

  // biome-ignore lint/correctness/useExhaustiveDependencies: follows each new batch of rows.
  useLayoutEffect(() => {
    const node = scrollRef.current
    if (node && following.current) node.scrollTop = node.scrollHeight
  }, [rows])

  const onScroll = () => {
    const node = scrollRef.current
    if (!node) return
    following.current = node.scrollHeight - node.scrollTop - node.clientHeight < FOLLOW_WITHIN
  }

  return (
    <div
      ref={scrollRef}
      onScroll={onScroll}
      className="flex min-h-0 flex-1 flex-col overflow-y-auto overflow-x-hidden"
    >
      <div className="mx-auto flex w-full min-w-0 max-w-3xl flex-1 flex-col gap-2 px-4 py-4">
        {!loaded ? (
          <Note>Looking for this agent's log…</Note>
        ) : rows.length === 0 ? (
          <Note>{running ? 'Nothing yet: it has just started.' : 'This agent left no log.'}</Note>
        ) : (
          <>
            {earlier && (
              <div className="mx-auto px-3 py-1 text-[12px] text-[var(--soromi-text-faint)]">
                Showing its latest work
              </div>
            )}
            {rows.map((row) => (
              <ChatRow key={row.key} row={row} />
            ))}
          </>
        )}
        {loaded && running && (
          <WorkingIndicator since={since ?? null} tokens={null} interruptible={false} />
        )}
      </div>
    </div>
  )
}

function Note({ children }: { children: string }) {
  return (
    <div className="flex flex-1 items-center justify-center px-6 text-center text-[13px] text-[var(--soromi-text-faint)] leading-[1.5]">
      {children}
    </div>
  )
}
