import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

//
import { loadSpaces, saveSpaces } from './space-store'

let home: string
let previous: string | undefined

beforeEach(() => {
  home = mkdtempSync(join(tmpdir(), 'soromi-store-'))
  previous = process.env.SOROMI_HOME
  process.env.SOROMI_HOME = home
})
afterEach(() => {
  if (previous === undefined) delete process.env.SOROMI_HOME
  else process.env.SOROMI_HOME = previous
  rmSync(home, { recursive: true, force: true })
})

describe('space store', () => {
  it('returns an empty list when nothing is saved', () => {
    expect(loadSpaces()).toEqual([])
  })

  it('round-trips saved spaces', () => {
    const spaces = [
      { name: 'kazomi', root: '/w/kazomi', folders: ['.'], agent: 'claude', account: 'personal' },
    ]
    saveSpaces(spaces)
    expect(loadSpaces()).toEqual(spaces)
  })
})
