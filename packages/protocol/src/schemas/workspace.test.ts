import { describe, expect, it } from 'vitest'
import { WorkspaceSchema } from './workspace'

const base = { name: 'kazomi', agent: 'claude', account: 'personal' }

describe('WorkspaceSchema', () => {
  it('accepts relative repo paths', () => {
    const result = WorkspaceSchema.safeParse({
      ...base,
      repos: ['kazomi-api', 'kazomi-web', 'nested/kazomi-mobile'],
    })
    expect(result.success).toBe(true)
  })

  it('rejects absolute repo paths', () => {
    expect(WorkspaceSchema.safeParse({ ...base, repos: ['/etc/passwd'] }).success).toBe(false)
  })

  it('rejects windows-style absolute repo paths', () => {
    expect(WorkspaceSchema.safeParse({ ...base, repos: ['C:\\repos\\api'] }).success).toBe(false)
  })

  it('rejects parent-escaping repo paths', () => {
    expect(WorkspaceSchema.safeParse({ ...base, repos: ['../secret'] }).success).toBe(false)
  })

  it('requires at least one repo', () => {
    expect(WorkspaceSchema.safeParse({ ...base, repos: [] }).success).toBe(false)
  })
})
