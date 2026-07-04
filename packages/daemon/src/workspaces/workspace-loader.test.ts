import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

//
import { loadWorkspace } from './workspace-loader'

let dir: string

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'soromi-ws-'))
})
afterEach(() => {
  rmSync(dir, { recursive: true, force: true })
})

function writeWorkspace(content: string): void {
  writeFileSync(join(dir, 'soromi.space.json'), content)
}

describe('loadWorkspace', () => {
  it('loads a valid workspace and resolves the root', () => {
    writeWorkspace(
      JSON.stringify({ name: 'kazomi', folders: ['api'], agent: 'claude', account: 'personal' }),
    )
    const { workspace, root } = loadWorkspace(dir)
    expect(workspace.name).toBe('kazomi')
    expect(workspace.folders).toEqual(['api'])
    expect(root).toBe(dir)
  })

  it('throws when soromi.space.json is missing', () => {
    expect(() => loadWorkspace(dir)).toThrow(/no soromi\.space\.json/)
  })

  it('throws on invalid JSON', () => {
    writeWorkspace('{ not json')
    expect(() => loadWorkspace(dir)).toThrow(/not valid JSON/)
  })

  it('throws on a schema violation (absolute folder path)', () => {
    writeWorkspace(
      JSON.stringify({ name: 'x', folders: ['/etc'], agent: 'claude', account: 'personal' }),
    )
    expect(() => loadWorkspace(dir)).toThrow(/invalid/)
  })
})
