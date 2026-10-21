//Types
import type { ChatFile, ToolKind } from '@soromi/protocol'

/** What a tool call came back with. */
export interface ToolResult {
  ok: boolean
  text: string
  /** The pictures it returned (reading a screenshot, say), bytes fetched once on screen. */
  files?: ChatFile[]
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

/**
 * The verb that leads a tool row, past tense like a work log. A tool of no known kind keeps its
 * name; one from an MCP server (`mcp__tablepro__execute_query`) is named by server and tool.
 */
export function toolVerb(kind: ToolKind, name: string): string {
  const known = VERBS[kind]
  if (known) return known
  const [prefix, server, ...tool] = name.split('__')
  if (prefix === 'mcp' && server && tool.length > 0) return `${server} · ${tool.join('__')}`

  return name
}

/**
 * What was sent to a tool of no known kind (an MCP tool, say), laid out to be read: JSON over
 * lines and indented, anything else as it came. `undefined` for the kinds drawn their own way.
 */
export function toolInput(tool: ToolItem): string | undefined {
  if (tool.kind !== 'other' || !tool.body) return undefined
  try {
    return JSON.stringify(JSON.parse(tool.body), null, 2)
  } catch {
    // Cut short by the daemon, or not JSON at all: shown as it is.
    return tool.body
  }
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
  // What a tool of no known kind was sent is worth opening even before it answers: it is the only
  // way to see what was asked of it.
  const shown =
    tool.kind === 'edit' || tool.kind === 'write' || tool.kind === 'run' || tool.kind === 'other'
  return Boolean((shown && tool.body) || tool.result)
}

/**
 * Whether a tool row starts open. A change is the point, so edits and writes do; an error does so
 * the failure shows; and so does one that came back with a picture, which is there to be looked
 * at. Commands and reads stay closed otherwise: their output is context, not the answer.
 */
export function toolOpensByDefault(tool: ToolItem): boolean {
  if (tool.kind === 'edit' || tool.kind === 'write') return true
  if (!tool.result) return false

  return !tool.result.ok || (tool.result.files?.length ?? 0) > 0
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
