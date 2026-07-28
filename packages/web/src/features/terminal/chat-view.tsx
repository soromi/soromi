import { useEffect, useMemo, useRef, useState } from 'react'

//Packages
import { useClientStore, useTransport } from '@soromi/client'

//Types
import type { ChatEvent } from '@soromi/protocol'
import type { KeyboardEvent } from 'react'

// Prose wraps to the screen width, the whole point of the chat view over the terminal.
const ASSISTANT =
  'whitespace-pre-wrap [overflow-wrap:anywhere] text-sm leading-[1.5] text-[var(--soromi-text)]'
const USER = `${ASSISTANT} max-w-[85%] self-end rounded-xl bg-[var(--soromi-bg-active)] px-3 py-2`

// A tool card's monospace body; results add a scrollable, tinted panel on top of it.
const BODY =
  'm-0 whitespace-pre-wrap [overflow-wrap:anywhere] px-2.5 py-2 text-xs leading-[1.45] text-[var(--soromi-text-dim)] [font-family:var(--soromi-font-mono)]'
const RESULT = `${BODY} max-h-[180px] overflow-y-auto rounded-lg bg-[var(--soromi-bg-active)]`
const RESULT_ERROR = `${RESULT} text-[#f47070]`

interface Row {
  key: string
  kind: ChatEvent['kind']
  /** Prose / command / result text (rendered as-is, wrapped). */
  text: string
  /** Tool name, for a tool row's header. */
  name?: string
  /** File the tool touched, for a tool row's header. */
  path?: string
  /** A tool result that failed. */
  error?: boolean
  /** Diff lines (a tool body that looks like a `-`/`+` diff), colored per line. */
  diff?: { sign: '+' | '-' | ' '; text: string }[]
}

/**
 * The mobile chat view: the agent's transcript rendered as reflowing messages, tool cards, and
 * diffs (instead of the fixed-grid terminal). Parsed events come from the daemon tailing the
 * agent's JSONL transcript. The composer sends a follow-up as terminal input, so it drives the same
 * live session, subject to the same control model (disabled unless this viewport is in control).
 */
export function ChatView({ session }: { session: string }) {
  const transport = useTransport()
  const events = useClientStore((s) => s.chat[session])
  const inControl = useClientStore((s) => s.controlHolder === null)
  const scrollRef = useRef<HTMLDivElement>(null)

  // Build the render rows once per event change, so the JSX below only renders.
  const rows = useMemo(() => (events ?? []).map(toRow), [events])

  // Follow the tail as new events land.
  // biome-ignore lint/correctness/useExhaustiveDependencies: re-run on row count, scroll the node.
  useEffect(() => {
    const node = scrollRef.current
    if (node) node.scrollTop = node.scrollHeight
  }, [rows.length])

  return (
    <div className="absolute inset-0 flex flex-col bg-[var(--soromi-bg-app)]">
      <div
        ref={scrollRef}
        className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-3.5 py-3 [-webkit-overflow-scrolling:touch]"
      >
        {rows.map((row) => (
          <ChatRow key={row.key} row={row} />
        ))}
      </div>
      <Composer session={session} transport={transport} disabled={!inControl} />
    </div>
  )
}

function ChatRow({ row }: { row: Row }) {
  if (row.kind === 'tool') {
    return (
      <div className="overflow-hidden rounded-[10px] border border-[var(--soromi-border)] bg-[var(--soromi-bg-active)]">
        <div className="flex items-baseline gap-2 border-[var(--soromi-border)] border-b px-2.5 py-[7px]">
          <span className="font-semibold text-[var(--soromi-text)] text-xs">{row.name}</span>
          {row.path && (
            <span className="overflow-hidden text-ellipsis whitespace-nowrap text-[var(--soromi-text-dim)] text-xs [font-family:var(--soromi-font-mono)]">
              {row.path}
            </span>
          )}
        </div>
        {row.diff ? (
          <pre className={BODY}>
            {row.diff.map((line, index) => (
              <div
                // biome-ignore lint/suspicious/noArrayIndexKey: diff lines are positional and static.
                key={index}
                className={
                  line.sign === '+'
                    ? 'text-[var(--soromi-ok)]'
                    : line.sign === '-'
                      ? 'text-[#f47070]'
                      : undefined
                }
              >
                {line.sign === ' ' ? '' : line.sign} {line.text}
              </div>
            ))}
          </pre>
        ) : (
          row.text && <pre className={BODY}>{row.text}</pre>
        )}
      </div>
    )
  }

  if (row.kind === 'tool-result') {
    return <pre className={row.error ? RESULT_ERROR : RESULT}>{row.text}</pre>
  }

  if (row.kind === 'thinking') {
    return (
      <div className="whitespace-pre-wrap [overflow-wrap:anywhere] text-[13px] text-[var(--soromi-text-faint)] italic leading-[1.45]">
        {row.text}
      </div>
    )
  }

  return <div className={row.kind === 'user' ? USER : ASSISTANT}>{row.text}</div>
}

function Composer({
  session,
  transport,
  disabled,
}: {
  session: string
  transport: ReturnType<typeof useTransport>
  disabled: boolean
}) {
  const [value, setValue] = useState('')

  const send = () => {
    const text = value.trim()
    if (!text || disabled) return

    // A follow-up is typed into the agent's PTY, so it submits like any terminal input.
    transport.send({ type: 'input', session, data: `${text}\r` })
    setValue('')
  }

  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault()
      send()
    }
  }

  return (
    <div className="flex items-end gap-2 border-[var(--soromi-border)] border-t bg-[var(--soromi-bg-app)] px-2.5 py-2">
      <textarea
        className="max-h-[120px] flex-1 resize-none rounded-[10px] border border-[var(--soromi-border)] bg-[var(--soromi-bg-active)] px-3 py-[9px] font-[inherit] text-[var(--soromi-text)] text-sm focus:border-[var(--soromi-accent)] focus:outline-none"
        value={value}
        onChange={(event) => setValue(event.target.value)}
        onKeyDown={onKeyDown}
        placeholder={disabled ? 'Take control to reply' : 'Reply to the agent…'}
        rows={1}
        disabled={disabled}
      />
      <button
        type="button"
        className="cursor-pointer appearance-none rounded-[10px] border-none bg-[var(--soromi-accent)] px-4 py-[9px] font-semibold text-[var(--soromi-accent-on)] text-sm disabled:cursor-default disabled:opacity-40"
        onClick={send}
        disabled={disabled || !value.trim()}
      >
        Send
      </button>
    </div>
  )
}

/** Turns a transcript event into a render row, splitting a `-`/`+` tool body into colored lines. */
function toRow(event: ChatEvent, index: number): Row {
  const key = `${index}`

  if (event.kind === 'tool') {
    const diff = event.body && isDiff(event.body) ? toDiff(event.body) : undefined
    return {
      key,
      kind: 'tool',
      name: event.name,
      path: event.path,
      text: diff ? '' : (event.body ?? ''),
      diff,
    }
  }

  if (event.kind === 'tool-result') {
    return { key, kind: 'tool-result', text: event.text, error: !event.ok }
  }

  return { key, kind: event.kind, text: event.text }
}

function isDiff(body: string): boolean {
  return body.split('\n').some((line) => line.startsWith('+ ') || line.startsWith('- '))
}

function toDiff(body: string): { sign: '+' | '-' | ' '; text: string }[] {
  return body.split('\n').map((line) => {
    if (line.startsWith('+ ')) return { sign: '+', text: line.slice(2) }
    if (line.startsWith('- ')) return { sign: '-', text: line.slice(2) }
    return { sign: ' ', text: line }
  })
}
