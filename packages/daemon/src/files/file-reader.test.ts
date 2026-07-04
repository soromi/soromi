import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

//
import { readFileWithin } from './file-reader'

let root: string

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'soromi-read-'))
})
afterEach(() => {
  rmSync(root, { recursive: true, force: true })
})

describe('readFileWithin', () => {
  it('reads a text file', () => {
    writeFileSync(join(root, 'a.txt'), 'hello')
    expect(readFileWithin(root, 'a.txt')).toEqual({
      content: 'hello',
      truncated: false,
      binary: false,
    })
  })

  it('flags a binary file and returns no content', () => {
    writeFileSync(join(root, 'bin'), Buffer.from([0x68, 0x00, 0x69]))
    const result = readFileWithin(root, 'bin')
    expect(result.binary).toBe(true)
    expect(result.content).toBe('')
  })

  it('returns empty for a path that escapes the root', () => {
    expect(readFileWithin(root, '../../etc/passwd')).toEqual({
      content: '',
      truncated: false,
      binary: false,
    })
  })

  it('returns empty for a directory', () => {
    expect(readFileWithin(root, '.').content).toBe('')
  })
})
