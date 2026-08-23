import { useEffect, useState } from 'react'

//Utils
import { cn } from '../lib/utils'

//Types
import type { SubAgent } from '@soromi/protocol'

/** Status-dot color per sub-agent state (running is the common one). */
const DOT: Record<string, string> = {
  thinking: 'bg-[var(--soromi-warn)]',
  'waiting-input': 'bg-[var(--soromi-warn)]',
  blocked: 'bg-[#e08585]',
  done: 'bg-[var(--soromi-accent)]',
  idle: 'bg-[var(--soromi-text-faint)]',
}

/** "1m 12s" / "48s" from an elapsed seconds count. */
function formatElapsed(seconds: number): string {
  const total = Math.max(0, seconds)
  const minutes = Math.floor(total / 60)
  const secs = total % 60
  return minutes > 0 ? `${minutes}m ${String(secs).padStart(2, '0')}s` : `${secs}s`
}

/** Re-renders once a second (for live elapsed times) while `active`; idle otherwise. */
function useNowSeconds(active: boolean): number {
  const [now, setNow] = useState(() => Math.floor(Date.now() / 1000))
  useEffect(() => {
    if (!active) return
    const id = setInterval(() => setNow(Math.floor(Date.now() / 1000)), 1000)
    return () => clearInterval(id)
  }, [active])
  return now
}

const Chevron = ({ open }: { open: boolean }) => (
  <svg
    width="12"
    height="12"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2.2"
    strokeLinecap="round"
    strokeLinejoin="round"
    className={cn('transition-transform', open && 'rotate-180')}
    aria-hidden="true"
  >
    <path d="M6 9l6 6 6-6" />
  </svg>
)

/**
 * The "N agents working in the background" panel shown over the chat composer while the agent has
 * live sub-agents (`Task` calls). Collapsed by default; expands to a list of each sub-agent with its
 * elapsed time. `onStop` interrupts the turn (stopping the background work).
 */
export function AgentsPanel({ subagents, onStop }: { subagents: SubAgent[]; onStop?: () => void }) {
  const [open, setOpen] = useState(false)
  const now = useNowSeconds(subagents.length > 0)

  if (subagents.length === 0) return null

  return (
    <div className="mb-2 flex flex-col gap-2">
      <div className="flex items-center gap-3 rounded-[12px] border border-[var(--soromi-border)] px-4 py-3">
        <span className="h-2 w-2 flex-none rounded-full bg-[var(--soromi-warn)]" />
        <span className="flex-1 truncate font-medium text-[14px] text-[var(--soromi-text)]">
          {subagents.length} {subagents.length === 1 ? 'agent' : 'agents'} working in the background
        </span>
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          className="inline-flex cursor-pointer appearance-none items-center gap-1.5 border-none bg-transparent font-medium text-[13.5px] text-[var(--soromi-text-faint)] transition-colors hover:text-[var(--soromi-text-dim)]"
        >
          {open ? 'Hide' : 'Show'}
          <Chevron open={open} />
        </button>
        {onStop && (
          <button
            type="button"
            onClick={onStop}
            className="cursor-pointer appearance-none rounded-lg border border-[var(--soromi-border)] bg-transparent px-3 py-1.5 font-medium text-[13.5px] text-[var(--soromi-text-dim)] transition-colors hover:border-[#e08585] hover:text-[#e08585]"
          >
            Stop
          </button>
        )}
      </div>

      {open && (
        <div className="flex flex-col rounded-[12px] border border-[var(--soromi-border)] px-4 py-1.5">
          {subagents.map((agent, index) => (
            <div
              // biome-ignore lint/suspicious/noArrayIndexKey: sub-agents have no stable id; order is stable per turn.
              key={index}
              className="flex items-center gap-3 py-2.5"
            >
              <span
                className={cn('h-2 w-2 flex-none rounded-full', DOT[agent.status] ?? DOT.thinking)}
              />
              <span className="min-w-0 flex-1 truncate text-[14px] text-[var(--soromi-text)]">
                {agent.name}
              </span>
              {agent.started_at != null && (
                <span className="flex-none text-[13px] text-[var(--soromi-text-faint)] tabular-nums">
                  {formatElapsed(now - agent.started_at)}
                </span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
