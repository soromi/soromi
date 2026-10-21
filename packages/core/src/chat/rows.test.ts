import { describe, expect, it } from 'vitest'

import { buildRows } from './rows'
import {
  diffStat,
  summarizeTools,
  toolDiff,
  toolHasBody,
  toolOpensByDefault,
  toolState,
  toolTarget,
  toolVerb,
} from './tools'

//Types
import type { ChatEvent } from '@soromi/protocol'
import type { ToolItem } from './tools'

const tool = (id: string, toolKind: ToolItem['kind'] = 'run', body = 'ls'): ChatEvent => ({
  kind: 'tool',
  id,
  name: 'Bash',
  toolKind,
  body,
})
const result = (id: string, ok = true): ChatEvent => ({ kind: 'tool-result', id, ok, text: 'out' })
const says = (text: string): ChatEvent => ({ kind: 'assistant', text })

describe('buildRows', () => {
  it('folds a result into its call, and keeps a short run of calls as rows of their own', () => {
    const rows = buildRows([says('first'), tool('a'), result('a'), tool('b'), says('then')])

    expect(rows.map((row) => row.kind)).toEqual(['assistant', 'tool', 'tool', 'assistant'])
    const [, first, second] = rows
    expect(first.kind === 'tool' && first.tool.result).toEqual({ ok: true, text: 'out' })
    expect(second.kind === 'tool' && second.tool.result).toBeUndefined()
  })

  it('folds a long run of calls into one group', () => {
    const rows = buildRows([tool('a'), result('a'), tool('b'), tool('c', 'skill'), says('done')])

    expect(rows.map((row) => row.kind)).toEqual(['tool-group', 'assistant'])
    expect(rows[0].kind === 'tool-group' && rows[0].tools).toHaveLength(3)
  })

  it('keeps a row’s key when messages are added around it', () => {
    const kept = says('kept')
    const before = buildRows([kept])
    const after = buildRows([says('earlier'), kept, says('later')])

    expect(after[1].key).toBe(before[0].key)
  })

  it('passes a prompt through with its attachments, and reasoning as its own row', () => {
    const rows = buildRows([
      { kind: 'user', text: 'look' },
      { kind: 'thinking', text: 'hm' },
      { kind: 'notice', text: '[Interrupted]' },
    ])

    expect(rows.map((row) => row.kind)).toEqual(['user', 'thinking', 'notice'])
    expect(rows[0].kind === 'user' && rows[0].files).toEqual([])
  })
})

describe('a tool call', () => {
  const edit: ToolItem = {
    name: 'Edit',
    kind: 'edit',
    path: '/repo/src/a.ts',
    body: '- old\n+ new\n+ more\n same',
    result: { ok: true, text: 'updated' },
  }
  const run: ToolItem = { name: 'Bash', kind: 'run', body: 'grep -rn x .\nsecond line' }

  it('is named for what it did, and shows what it did it to', () => {
    expect(toolVerb('edit', 'Edit')).toBe('Edited')
    expect(toolVerb('other', 'DesignSync')).toBe('DesignSync')
    expect(toolTarget(edit)).toBe('a.ts')
    expect(toolTarget(run)).toBe('grep -rn x .')
    expect(toolTarget({ name: 'Skill', kind: 'skill', body: 'claude-api' })).toBe('claude-api')
  })

  it('reads an edit as lines added, removed and kept', () => {
    const diff = toolDiff(edit)

    expect(diff?.map((line) => line.sign)).toEqual(['-', '+', '+', ' '])
    expect(diff && diffStat(diff)).toEqual({ add: 2, del: 1 })
    expect(toolDiff(run)).toBeNull()
  })

  it('is running until its result arrives, and says how it ended', () => {
    expect(toolState(run)).toBe('running')
    expect(toolState(edit)).toBe('done')
    expect(toolState({ ...run, result: { ok: false, text: 'boom' } })).toBe('error')
  })

  it('opens on its own when it changed something or failed', () => {
    expect(toolOpensByDefault(edit)).toBe(true)
    expect(toolOpensByDefault(run)).toBe(false)
    expect(toolOpensByDefault({ ...run, result: { ok: false, text: 'boom' } })).toBe(true)
  })

  it('has something to open unless it is a skill, or a read still under way', () => {
    expect(toolHasBody(run)).toBe(true)
    expect(toolHasBody({ name: 'Read', kind: 'read', path: 'a.ts' })).toBe(false)
    expect(toolHasBody({ name: 'Read', kind: 'read', result: { ok: true, text: 'x' } })).toBe(true)
    expect(toolHasBody({ name: 'Skill', kind: 'skill', result: { ok: true, text: 'x' } })).toBe(
      false,
    )
  })

  it('is counted by verb when a run of them is summed up', () => {
    const skill: ToolItem = { name: 'Skill', kind: 'skill' }

    expect(summarizeTools([run, run, skill, run, run])).toBe('Ran 4 · Skill 1')
  })
})
