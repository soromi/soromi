import { Clock, Paperclip, X } from 'lucide-react'

//Types
import type { QueuedTurn } from '@soromi/protocol'

/**
 * The messages queued over the chat composer: typed while the agent worked, each goes out as the
 * next turn once the running one ends, one at a time, in this order. The daemon holds them, so
 * every device shows the same queue. A row can be sent now (it then steers the running turn, as a
 * message sent mid-turn does) or dropped. After a stop the queue is held until a turn is sent.
 */
export function QueuePanel({
  queued,
  paused,
  disabled,
  onUnqueue,
}: {
  queued: QueuedTurn[]
  paused: boolean
  /** This viewport does not drive the session: the rows can be read, not acted on. */
  disabled: boolean
  /** Takes a message out: `send` sends it now, otherwise it is dropped. */
  onUnqueue: (id: string, send: boolean) => void
}) {
  if (queued.length === 0) return null

  return (
    <div className="mb-2 flex flex-col rounded-[12px] border border-[var(--soromi-border)] px-4 py-2">
      <div className="flex items-center gap-2 py-1 text-[12.5px] text-[var(--soromi-text-faint)]">
        <Clock className="size-3.5 flex-none" />
        <span className="truncate">
          {paused
            ? 'Queued, held after Stop: they go once your next message is answered.'
            : queued.length === 1
              ? 'Queued: sent when the agent finishes.'
              : `${queued.length} queued: sent one at a time as the agent finishes.`}
        </span>
      </div>
      {queued.map((turn) => (
        <div key={turn.id} className="flex items-center gap-2 py-1.5">
          <span
            className="min-w-0 flex-1 truncate text-[14px] text-[var(--soromi-text)]"
            title={turn.text}
          >
            {turn.text || 'Attachments only'}
          </span>
          {turn.files ? (
            <span
              className="flex flex-none items-center gap-0.5 text-[12px] text-[var(--soromi-text-faint)] tabular-nums"
              title={`${turn.files} ${turn.files === 1 ? 'file' : 'files'} attached`}
            >
              <Paperclip className="size-3" />
              {turn.files}
            </span>
          ) : null}
          <button
            type="button"
            disabled={disabled}
            onClick={() => onUnqueue(turn.id, true)}
            title="Send it now: the agent reads it as it works, without waiting for the turn to end"
            className="flex-none cursor-pointer appearance-none rounded-lg border border-[var(--soromi-border)] bg-transparent px-2.5 py-1 font-medium text-[12.5px] text-[var(--soromi-text-dim)] transition-colors hover:bg-[var(--soromi-bg-hover)] hover:text-[var(--soromi-text)] disabled:cursor-default disabled:opacity-50"
          >
            Send now
          </button>
          <button
            type="button"
            disabled={disabled}
            onClick={() => onUnqueue(turn.id, false)}
            title="Remove it from the queue"
            className="flex size-6 flex-none cursor-pointer appearance-none items-center justify-center rounded-md border-none bg-transparent text-[var(--soromi-text-faint)] transition-colors hover:text-[var(--soromi-danger-soft)] disabled:cursor-default disabled:opacity-50"
          >
            <X className="size-3.5" />
          </button>
        </div>
      ))}
    </div>
  )
}
