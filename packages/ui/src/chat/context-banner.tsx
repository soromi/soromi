import { useState } from 'react'

const Spinner = () => (
  <svg
    width="14"
    height="14"
    viewBox="0 0 24 24"
    fill="none"
    className="animate-spin"
    aria-hidden="true"
  >
    <circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity="0.25" strokeWidth="3" />
    <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
  </svg>
)

/**
 * A warning above the composer when the conversation is filling the model's context window, offering
 * the same choices Claude's interactive flow does: compact (summarize to free space) or clear (reset
 * history). Shown once usage crosses the threshold; dismissable. `tokens`/`limit` drive the percent.
 * `busy` (a turn/command running) disables the actions and, once one is clicked, shows a spinner
 * until it finishes — compaction takes a while, so this stops double-triggering it.
 */
export function ContextBanner({
  tokens,
  limit,
  busy = false,
  pending = null,
  onCompact,
  onClear,
}: {
  tokens: number
  limit: number
  /** Disables the actions (a turn/command is running). */
  busy?: boolean
  /** The command currently running (shows a spinner on its button). */
  pending?: '/compact' | '/clear' | null
  onCompact: () => void
  onClear: () => void
}) {
  const [dismissed, setDismissed] = useState(false)
  const pct = Math.min(100, Math.round((tokens / limit) * 100))

  if (pct < 80 || dismissed) return null

  return (
    <div className="mb-2 flex items-center gap-3 rounded-[12px] border border-[rgb(224_179_65/0.4)] bg-[rgb(224_179_65/0.1)] px-4 py-2.5">
      <span className="h-2 w-2 flex-none rounded-full bg-[#e0b341]" />
      <span className="min-w-0 flex-1 text-[13.5px] text-[var(--soromi-text-dim)]">
        Context is {pct}% full — compact to free up space, or the agent will auto-compact soon.
      </span>
      <button
        type="button"
        disabled={busy}
        onClick={onCompact}
        className="flex-none inline-flex cursor-pointer appearance-none items-center gap-1.5 rounded-lg border-none bg-[#e0b341] px-3 py-1.5 font-semibold text-[13px] text-[#2a2205] transition-colors hover:bg-[#eac25a] disabled:cursor-default disabled:opacity-70"
      >
        {pending === '/compact' && <Spinner />}
        Compact
      </button>
      <button
        type="button"
        disabled={busy}
        onClick={onClear}
        className="flex-none inline-flex cursor-pointer appearance-none items-center gap-1.5 rounded-lg border border-[var(--soromi-border)] bg-transparent px-3 py-1.5 font-medium text-[13px] text-[var(--soromi-text-dim)] transition-colors hover:border-[#e08585] hover:text-[#e08585] disabled:cursor-default disabled:opacity-50"
      >
        {pending === '/clear' && <Spinner />}
        Clear
      </button>
      <button
        type="button"
        onClick={() => setDismissed(true)}
        aria-label="Dismiss"
        className="flex h-6 w-6 flex-none cursor-pointer appearance-none items-center justify-center rounded-md border-none bg-transparent text-[var(--soromi-text-faint)] hover:text-[var(--soromi-text-dim)]"
      >
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          aria-hidden="true"
        >
          <path d="M6 6l12 12M18 6L6 18" />
        </svg>
      </button>
    </div>
  )
}
