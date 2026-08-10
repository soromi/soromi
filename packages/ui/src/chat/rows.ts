//Types
import type { ToolItem, ToolResult } from './tool-call'
import type { ChatEvent } from '@soromi/protocol'

// Consecutive tool calls at or above this count collapse into one expandable group; fewer render
// inline so a quick 1-2 step read still shows at a glance.
const GROUP_MIN = 3

/** One rendered line of the conversation: a text bubble, a single tool card, or a folded tool group. */
export type Row =
  | { key: string; kind: 'user' | 'assistant' | 'thinking' | 'notice'; text: string }
  | { key: string; kind: 'tool'; tool: ToolItem }
  | { key: string; kind: 'tool-group'; tools: ToolItem[] }

// Stable, position-independent row keys: keyed by the event object's identity (the store reuses event
// object references across both append and "load earlier" prepend), so prepending older messages
// doesn't shift array indices and remount — and re-highlight — the entire list.
let keySeq = 0
const rowKeys = new WeakMap<object, string>()
function rowKey(event: ChatEvent): string {
  let key = rowKeys.get(event)
  if (!key) {
    key = `r${keySeq++}`
    rowKeys.set(event, key)
  }
  return key
}

/**
 * Builds render rows: tool results fold into their call (matched by id); a run of consecutive tool
 * calls collapses into one `tool-group` (expandable) once it reaches `GROUP_MIN`, so a long read/grep
 * burst stays tidy; shorter runs and everything else map straight through.
 */
export function buildRows(events: ChatEvent[]): Row[] {
  const resultById = new Map<string, ToolResult>()
  for (const event of events) {
    if (event.kind === 'tool-result') resultById.set(event.id, { ok: event.ok, text: event.text })
  }

  const rows: Row[] = []
  let run: { key: string; tool: ToolItem }[] = []

  // Flush the buffered run of tool calls: a group when long enough, else inline rows.
  const flush = () => {
    if (run.length >= GROUP_MIN) {
      rows.push({ key: `g${run[0].key}`, kind: 'tool-group', tools: run.map((r) => r.tool) })
    } else {
      for (const r of run) rows.push({ key: r.key, kind: 'tool', tool: r.tool })
    }
    run = []
  }

  events.forEach((event) => {
    const key = rowKey(event)
    if (event.kind === 'tool-result') return // folded into its tool card
    if (event.kind === 'tool') {
      run.push({
        key,
        tool: {
          name: event.name,
          path: event.path,
          body: event.body,
          result: resultById.get(event.id),
        },
      })
      return
    }
    flush()
    rows.push({ key, kind: event.kind, text: event.text })
  })
  flush()
  return rows
}
