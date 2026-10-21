import { ClipboardList, ShieldQuestion } from 'lucide-react'

//Components
import { Markdown } from './markdown'
import { ToolCall } from './tool-call'

//Types
import type { ToolApproval } from '@soromi/protocol'

/**
 * A permission prompt: the agent wants to run a tool and is paused until the user allows or denies it
 * (headless chat, `--permission-prompt-tool stdio`). Shows the tool as a card (the same one a settled
 * call uses, so a diff / command is visible) with Allow / Deny beneath.
 *
 * A `"plan"` approval (the daemon's provider-agnostic kind — the agent asking to leave plan mode and
 * start coding, whatever the provider calls its tool) gets its own review layout: the plan rendered
 * as markdown, with plan-shaped choices.
 */
export function Approval({
  approval,
  onAllow,
  onDeny,
}: {
  approval: ToolApproval
  onAllow: () => void
  onDeny: () => void
}) {
  if (approval.kind === 'plan') {
    return (
      <div className="rounded-[10px] border border-[var(--soromi-accent)]/45 bg-[var(--soromi-bg-inset)] p-2.5">
        <div className="mb-2 flex items-center gap-1.5 text-[12.5px] text-[var(--soromi-accent)]">
          <ClipboardList className="h-3.5 w-3.5" />
          <span className="font-medium">Approve this plan and start coding?</span>
        </div>
        {approval.body && (
          <div className="max-h-[360px] overflow-auto rounded-[8px] border border-[var(--soromi-border)] bg-[var(--soromi-bg-terminal)] px-3 py-2">
            <Markdown>{approval.body}</Markdown>
          </div>
        )}
        <div className="mt-2 flex justify-end gap-2">
          <button
            type="button"
            onClick={onDeny}
            className="cursor-pointer appearance-none rounded-lg border border-[var(--soromi-border)] bg-transparent px-3 py-1.5 font-medium text-[12.5px] text-[var(--soromi-text-dim)] hover:bg-[var(--soromi-bg-hover)]"
          >
            Keep planning
          </button>
          <button
            type="button"
            onClick={onAllow}
            className="cursor-pointer appearance-none rounded-lg border-none bg-[var(--soromi-accent)] px-3.5 py-1.5 font-semibold text-[12.5px] text-[var(--soromi-accent-on)] hover:opacity-90"
          >
            Approve &amp; code
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="rounded-[10px] border border-[var(--soromi-warn)]/45 bg-[var(--soromi-bg-inset)] p-2.5">
      <div className="mb-1.5 flex items-center gap-1.5 text-[12.5px] text-[var(--soromi-warn)]">
        <ShieldQuestion className="h-3.5 w-3.5" />
        <span className="font-medium">Allow this action?</span>
      </div>
      <ToolCall
        name={approval.name}
        kind={approval.kind}
        path={approval.path}
        body={approval.body}
      />
      <div className="mt-2 flex justify-end gap-2">
        <button
          type="button"
          onClick={onDeny}
          className="cursor-pointer appearance-none rounded-lg border border-[var(--soromi-border)] bg-transparent px-3 py-1.5 font-medium text-[12.5px] text-[var(--soromi-text-dim)] hover:bg-[var(--soromi-bg-hover)]"
        >
          Deny
        </button>
        <button
          type="button"
          onClick={onAllow}
          className="cursor-pointer appearance-none rounded-lg border-none bg-[var(--soromi-accent)] px-3.5 py-1.5 font-semibold text-[12.5px] text-[var(--soromi-accent-on)] hover:opacity-90"
        >
          Allow
        </button>
      </div>
    </div>
  )
}
