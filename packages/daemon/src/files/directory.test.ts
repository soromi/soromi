import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

//
import { listDirectory } from './directory'

let root: string

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'soromi-tree-'))
  mkdirSync(join(root, 'api', 'src'), { recursive: true })
  writeFileSync(join(root, 'api', 'package.json'), '{}')
  writeFileSync(join(root, 'api', 'src', 'index.ts'), '')
})
afterEach(() => {
  rmSync(root, { recursive: true, force: true })
})

describe('listDirectory', () => {
  it('lists the folders at the root (empty path)', () => {
    expect(listDirectory(root, ['api', 'web'], '')).toEqual([
      { name: 'api', type: 'dir' },
      { name: 'web', type: 'dir' },
    ])
  })

  it('lists the root contents when the only folder is "."', () => {
    expect(listDirectory(root, ['.'], '')).toEqual([{ name: 'api', type: 'dir' }])
  })

  it('reads a directory, dirs before files', () => {
    expect(listDirectory(root, ['api'], 'api')).toEqual([
      { name: 'src', type: 'dir' },
      { name: 'package.json', type: 'file' },
    ])
  })

  it('returns nothing for a path that escapes the root', () => {
    expect(listDirectory(root, ['api'], '../..')).toEqual([])
  })

  it('returns nothing for a missing directory', () => {
    expect(listDirectory(root, ['api'], 'api/nope')).toEqual([])
  })
})
