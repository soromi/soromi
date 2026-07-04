import { describe, expect, it } from 'vitest'

//
import { WorkspaceSchema } from './workspace'

const base = { name: 'kazomi', agent: 'claude', account: 'personal' }

describe('WorkspaceSchema', () => {
  it('accepts relative folder paths', () => {
    const result = WorkspaceSchema.safeParse({
      ...base,
      folders: ['kazomi-api', 'kazomi-web', 'nested/kazomi-mobile'],
    })
    expect(result.success).toBe(true)
  })

  it('rejects absolute folder paths', () => {
    expect(WorkspaceSchema.safeParse({ ...base, folders: ['/etc/passwd'] }).success).toBe(false)
  })

  it('rejects windows-style absolute folder paths', () => {
    expect(WorkspaceSchema.safeParse({ ...base, folders: ['C:\\repos\\api'] }).success).toBe(false)
  })

  it('rejects parent-escaping folder paths', () => {
    expect(WorkspaceSchema.safeParse({ ...base, folders: ['../secret'] }).success).toBe(false)
  })

  it('requires at least one folder', () => {
    expect(WorkspaceSchema.safeParse({ ...base, folders: [] }).success).toBe(false)
  })
})
