import {
  Bot,
  ChevronRight,
  FileText,
  Pencil,
  Search,
  SquarePen,
  SquareTerminal,
  Wrench,
} from 'lucide-react'
import { type ComponentType, useState } from 'react'

//Utils
import { cn } from '../lib/utils'

export interface ToolResult {
  ok: boolean
  text: string
}

export interface ToolCallProps {
  /** The tool name (`Bash`, `Edit`, `Read`, `Agent`, …). */
  name: string
  /** The file the tool touched, shown inline in the header. */
  path?: string
  /** A one-glance summary of the call: a command, a diff, written content, a query. */
  body?: string
  /** The tool's result once it lands. */
  result?: ToolResult
}

/** One tool call's data, shared by the single-call view and the grouped view. */
export type ToolItem = ToolCallProps

/** The past-tense verb that leads a tool row (`Edited`, `Ran`, `Read`, …). Used by group summaries. */
export function toolVerb(name: string): string {
  return verbFor(kindOf(name), name)
}

type Kind = 'edit' | 'write' | 'bash' | 'read' | 'search' | 'agent' | 'other'

// The mono panel shared by diffs, written content, and command output.
const PANEL =
  'm-0 max-h-[320px] overflow-auto px-3 py-2 text-[11.5px] leading-[1.5] [font-family:var(--soromi-font-mono)] [overflow-wrap:anywhere] whitespace-pre-wrap'

/**
 * One agent tool call, rendered like a coding agent's activity log: a compact, muted one-line row
 * (icon + verb + target + a status dot) that reads as a tidy list when a turn fans out many tools.
 * File edits show their diff inline by default (green/red, the change is the point); verbose calls
 * (a shell command's output, a read) stay tucked behind the row and expand on click. Pairs a
 * transcript `tool` event with its matching `tool-result` so a call and its output read as one step.
 */
export function ToolCall({ name, path, body, result }: ToolCallProps) {
  const kind = kindOf(name)
  const Icon = iconFor(kind)
  const diff = kind === 'edit' && body ? toDiff(body) : null
  const stat = diff ? countStat(diff) : null

  // The change matters, so edits/writes open by default; an error opens so the failure shows. Bash
  // and reads stay collapsed — their output is context, not the answer.
  const opensByDefault = kind === 'edit' || kind === 'write' || (result != null && !result.ok)
  const [open, setOpen] = useState(opensByDefault)

  const target = kind === 'bash' ? firstLine(body) : (baseName(path) ?? firstLine(body))
  const hasBody = Boolean(diff || (kind === 'write' && body) || (kind === 'bash' && body) || result)

  const state: State = result ? (result.ok ? 'done' : 'error') : 'running'

  return (
    <div className="text-[13px]">
      <button
        type="button"
        onClick={() => hasBody && setOpen((o) => !o)}
        className={cn(
          'group flex w-full appearance-none items-center gap-2 border-none bg-transparent px-0.5 py-1 text-left',
          hasBody ? 'cursor-pointer' : 'cursor-default',
        )}
      >
        <ChevronRight
          className={cn(
            'h-3 w-3 flex-none text-[var(--soromi-text-faint)] transition-transform',
            !hasBody && 'invisible',
            open && 'rotate-90',
          )}
        />
        <Icon className="h-3.5 w-3.5 flex-none text-[var(--soromi-text-faint)]" />
        <span className="flex-none text-[var(--soromi-text-dim)]">{verbFor(kind, name)}</span>
        {target && (
          <span className="min-w-0 flex-1 overflow-hidden text-ellipsis whitespace-nowrap text-[12.5px] text-[var(--soromi-text-faint)] [font-family:var(--soromi-font-mono)]">
            {target}
          </span>
        )}
        {stat && (
          <span className="flex-none [font-family:var(--soromi-font-mono)] text-[11.5px]">
            <span className="text-[var(--soromi-ok)]">+{stat.add}</span>{' '}
            <span className="text-[#f47070]">-{stat.del}</span>
          </span>
        )}
        <StatusDot state={state} />
      </button>

      {open && hasBody && (
        <div className="mt-1 mb-1.5 ml-5 overflow-hidden rounded-[8px] border border-[var(--soromi-border)] bg-[var(--soromi-bg-active)]">
          {diff ? (
            <pre className={PANEL}>
              {diff.map((line, index) => (
                <div
                  // biome-ignore lint/suspicious/noArrayIndexKey: diff lines are positional and static.
                  key={index}
                  className={cn(
                    'px-1',
                    line.sign === '+' && 'bg-[#12321f] text-[var(--soromi-ok)]',
                    line.sign === '-' && 'bg-[#3a1717] text-[#f47070]',
                    line.sign === ' ' && 'text-[var(--soromi-text-dim)]',
                  )}
                >
                  {line.sign === ' ' ? ' ' : line.sign} {line.text}
                </div>
              ))}
            </pre>
          ) : kind === 'write' && body ? (
            <pre className={cn(PANEL, 'text-[var(--soromi-text-dim)]')}>{body}</pre>
          ) : kind === 'bash' && body ? (
            <pre className={cn(PANEL, 'text-[var(--soromi-text-dim)]')}>{`$ ${body}`}</pre>
          ) : null}

          {result?.text && (
            <div className="border-[var(--soromi-border)] border-t">
              <pre
                className={cn(
                  PANEL,
                  !result.ok ? 'text-[#f47070]' : 'text-[var(--soromi-text-faint)]',
                )}
              >
                {result.text}
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

type State = 'running' | 'done' | 'error'

/** A small status dot: amber (pulsing) while running, green done, red error. */
function StatusDot({ state }: { state: State }) {
  const color =
    state === 'done'
      ? 'bg-[var(--soromi-ok)]'
      : state === 'error'
        ? 'bg-[#f47070]'
        : 'bg-[var(--soromi-warn)] motion-safe:animate-status-pulse'
  return <span className={cn('h-[6px] w-[6px] flex-none rounded-full', color)} />
}

function kindOf(name: string): Kind {
  switch (name) {
    case 'Edit':
    case 'MultiEdit':
      return 'edit'
    case 'Write':
      return 'write'
    case 'Bash':
      return 'bash'
    case 'Read':
      return 'read'
    case 'Grep':
    case 'Glob':
      return 'search'
    case 'Task':
    case 'Agent':
      return 'agent'
    default:
      return 'other'
  }
}

/** The muted verb that leads the row (past tense, like a work log). */
function verbFor(kind: Kind, name: string): string {
  switch (kind) {
    case 'edit':
      return 'Edited'
    case 'write':
      return 'Wrote'
    case 'bash':
      return 'Ran'
    case 'read':
      return 'Read'
    case 'search':
      return 'Searched'
    case 'agent':
      return 'Agent'
    default:
      return name
  }
}

function iconFor(kind: Kind): ComponentType<{ className?: string }> {
  switch (kind) {
    case 'edit':
      return Pencil
    case 'write':
      return SquarePen
    case 'bash':
      return SquareTerminal
    case 'read':
      return FileText
    case 'search':
      return Search
    case 'agent':
      return Bot
    default:
      return Wrench
  }
}

function baseName(path: string | undefined): string | undefined {
  if (!path) return undefined
  const name = path.split('/').filter(Boolean).pop()
  return name ?? path
}

function firstLine(text: string | undefined): string | undefined {
  if (!text) return undefined
  const line = text.split('\n', 1)[0].trim()
  return line.length > 0 ? line : undefined
}

type DiffLine = { sign: '+' | '-' | ' '; text: string }

function toDiff(body: string): DiffLine[] {
  return body.split('\n').map((line) => {
    if (line.startsWith('+ ')) return { sign: '+', text: line.slice(2) }
    if (line.startsWith('- ')) return { sign: '-', text: line.slice(2) }
    return { sign: ' ', text: line }
  })
}

function countStat(diff: DiffLine[]): { add: number; del: number } {
  let add = 0
  let del = 0
  for (const line of diff) {
    if (line.sign === '+') add++
    else if (line.sign === '-') del++
  }
  return { add, del }
}
