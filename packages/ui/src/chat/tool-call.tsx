import {
  Bot,
  ChevronRight,
  ClipboardList,
  FileText,
  Pencil,
  Search,
  Sparkles,
  SquarePen,
  SquareTerminal,
  Wrench,
} from 'lucide-react'
import {
  diffStat,
  toolDiff,
  toolHasBody,
  toolInput,
  toolOpensByDefault,
  toolState,
  toolTarget,
  toolVerb,
} from '@soromi/core'
import { type ComponentType, useState } from 'react'

//Components
import { ResultImages } from './attachments'

//Types
import type { ToolItem, ToolResult, ToolState } from '@soromi/core'
import type { ToolKind } from '@soromi/protocol'

//Utils
import { cn } from '../lib/utils'

export type { ToolItem, ToolResult }

/** One tool call's data (see `ToolItem` in `@soromi/core`, shared with the mobile app). */
export type ToolCallProps = ToolItem

export { toolVerb }

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
export function ToolCall(tool: ToolCallProps) {
  const { name, kind, body, result } = tool
  const Icon = iconFor(kind)
  const diff = toolDiff(tool)
  const stat = diff ? diffStat(diff) : null

  // The change matters, so edits/writes open by default; an error opens so the failure shows. Bash
  // and reads stay collapsed — their output is context, not the answer.
  const [open, setOpen] = useState(toolOpensByDefault(tool))

  const target = toolTarget(tool)
  // What a tool of no known kind (an MCP tool) was sent, laid out to be read when opened.
  const input = toolInput(tool)
  // A skill row is a clean marker (icon + name); its "Launching skill …" result is noise, so the
  // row stays a non-expandable one-liner rather than hiding that behind a chevron.
  const hasBody = toolHasBody(tool)

  const state = toolState(tool)

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
        <span className="flex-none text-[var(--soromi-text-dim)]">{toolVerb(kind, name)}</span>
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
          ) : kind === 'run' && body ? (
            <pre className={cn(PANEL, 'text-[var(--soromi-text-dim)]')}>{`$ ${body}`}</pre>
          ) : input ? (
            <pre className={cn(PANEL, 'text-[var(--soromi-text-dim)]')}>{input}</pre>
          ) : null}

          {result?.files && result.files.length > 0 && (
            <div className="border-[var(--soromi-border)] border-t first:border-t-0">
              <ResultImages files={result.files} />
            </div>
          )}
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

/** A small status dot: amber (pulsing) while running, green done, red error. */
function StatusDot({ state }: { state: ToolState }) {
  const color =
    state === 'done'
      ? 'bg-[var(--soromi-ok)]'
      : state === 'error'
        ? 'bg-[#f47070]'
        : 'bg-[var(--soromi-warn)] motion-safe:animate-status-pulse'
  return <span className={cn('h-[6px] w-[6px] flex-none rounded-full', color)} />
}

function iconFor(kind: ToolKind): ComponentType<{ className?: string }> {
  switch (kind) {
    case 'edit':
      return Pencil
    case 'write':
      return SquarePen
    case 'run':
      return SquareTerminal
    case 'read':
      return FileText
    case 'search':
      return Search
    case 'agent':
      return Bot
    case 'skill':
      return Sparkles
    case 'plan':
      return ClipboardList
    default:
      return Wrench
  }
}
