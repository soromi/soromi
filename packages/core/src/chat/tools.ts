//Types
import type { ToolKind } from '@soromi/protocol'

/** What a tool call came back with. */
export interface ToolResult {
  ok: boolean
  text: string
}

/** One tool call of the agent's, with its result once that has arrived. */
export interface ToolItem {
  /** The tool's own name (`Bash`, `Edit`, …): only the label for a kind with no verb of its own. */
  name: string
  /** The provider-agnostic category (from the daemon): picks the icon and the verb. */
  kind: ToolKind
  /** The file the tool touched. */
  path?: string
  /** A one-glance summary of the call: a command, a diff, written content, a query. */
  body?: string
  result?: ToolResult
}

/** Where a tool call stands: still running, or how it ended. */
export type ToolState = 'running' | 'done' | 'error'

/** One line of an edit, as the daemon summarises it: added, removed, or left as it was. */
export interface ToolDiffLine {
  sign: '+' | '-' | ' '
  text: string
}

const VERBS: Partial<Record<ToolKind, string>> = {
  edit: 'Edited',
  write: 'Wrote',
  run: 'Ran',
  read: 'Read',
  search: 'Searched',
  agent: 'Agent',
  skill: 'Skill',
  plan: 'Plan',
}

/** The verb that leads a tool row, past tense like a work log; a tool of no known kind keeps its name. */
export function toolVerb(kind: ToolKind, name: string): string {
  return VERBS[kind] ?? name
}

function baseName(path: string | undefined): string | undefined {
  if (!path) return undefined
  return path.split('/').filter(Boolean).pop() ?? path
}

function firstLine(text: string | undefined): string | undefined {
  const line = text?.split('\n', 1)[0].trim()
  return line ? line : undefined
}

/** What a tool call acted on, in a line: the command it ran, or else the file, or the start of its body. */
export function toolTarget(tool: ToolItem): string | undefined {
  return tool.kind === 'run' ? firstLine(tool.body) : (baseName(tool.path) ?? firstLine(tool.body))
}

export function toolState(tool: ToolItem): ToolState {
  if (!tool.result) return 'running'
  return tool.result.ok ? 'done' : 'error'
}

/** An edit's body as diff lines, or `null` for a call that is not an edit. */
export function toolDiff(tool: ToolItem): ToolDiffLine[] | null {
  if (tool.kind !== 'edit' || !tool.body) return null
  return tool.body.split('\n').map((line) => {
    if (line.startsWith('+ ')) return { sign: '+', text: line.slice(2) }
    if (line.startsWith('- ')) return { sign: '-', text: line.slice(2) }
    return { sign: ' ', text: line }
  })
}

/** How many lines an edit added and removed. */
export function diffStat(diff: ToolDiffLine[]): { add: number; del: number } {
  let add = 0
  let del = 0
  for (const line of diff) {
    if (line.sign === '+') add++
    else if (line.sign === '-') del++
  }
  return { add, del }
}

/**
 * Whether a tool row has anything to open. A skill row is a clean marker (its "Launching skill …"
 * result is noise), so it never does.
 */
export function toolHasBody(tool: ToolItem): boolean {
  if (tool.kind === 'skill') return false
  const shown = tool.kind === 'edit' || tool.kind === 'write' || tool.kind === 'run'
  return Boolean((shown && tool.body) || tool.result)
}

/**
 * Whether a tool row starts open. A change is the point, so edits and writes do; an error does so
 * the failure shows. Commands and reads stay closed: their output is context, not the answer.
 */
export function toolOpensByDefault(tool: ToolItem): boolean {
  return tool.kind === 'edit' || tool.kind === 'write' || (tool.result != null && !tool.result.ok)
}

/** A short summary of a run of tool calls: the verbs and how many of each, "Ran 6 · Read 2". */
export function summarizeTools(tools: ToolItem[]): string {
  const counts = new Map<string, number>()
  for (const tool of tools) {
    const verb = toolVerb(tool.kind, tool.name)
    counts.set(verb, (counts.get(verb) ?? 0) + 1)
  }
  return [...counts].map(([verb, count]) => `${verb} ${count}`).join(' · ')
}
