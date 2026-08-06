//Components
import { Task, TaskContent, TaskTrigger } from '../components/ai-elements/task'
import { ToolCall, toolVerb } from './tool-call'

//Types
import type { ToolItem } from './tool-call'

/**
 * A run of consecutive tool calls, collapsed under one header (Vercel AI Elements' `Task`), so a turn
 * that reads or greps a dozen files stays one tidy line the user can expand — instead of a wall of
 * rows. The chat view groups the calls; a lone call renders as a plain `ToolCall` (no wrapper).
 */
export function ToolGroup({ tools }: { tools: ToolItem[] }) {
  return (
    <Task defaultOpen={false} className="text-[13px]">
      <TaskTrigger title={summarize(tools)} />
      <TaskContent className="[&>div]:mt-1.5 [&>div]:space-y-0.5 [&>div]:border-[var(--soromi-border)]">
        {tools.map((tool, index) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: tool calls are positional within a group.
          <ToolCall key={index} {...tool} />
        ))}
      </TaskContent>
    </Task>
  )
}

/** A short summary of a group: the verbs and how many of each, e.g. "Ran 6 · Read 2". */
function summarize(tools: ToolItem[]): string {
  const counts = new Map<string, number>()
  for (const tool of tools) {
    const verb = toolVerb(tool.name)
    counts.set(verb, (counts.get(verb) ?? 0) + 1)
  }
  return [...counts].map(([verb, count]) => `${verb} ${count}`).join(' · ')
}
