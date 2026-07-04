import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

//
import { FileAccountManager } from './account-store'

let home: string
let previous: string | undefined
const accounts = new FileAccountManager()

beforeEach(() => {
  home = mkdtempSync(join(tmpdir(), 'soromi-acctstore-'))
  previous = process.env.SOROMI_HOME
  process.env.SOROMI_HOME = home
})
afterEach(() => {
  if (previous === undefined) delete process.env.SOROMI_HOME
  else process.env.SOROMI_HOME = previous
  rmSync(home, { recursive: true, force: true })
})

describe('FileAccountManager', () => {
  it('returns an empty list when nothing is saved', () => {
    expect(accounts.list()).toEqual([])
  })

  it('saves, lists, and removes a profile', () => {
    const profile = { name: 'work', providers: { claude: { configDir: '~/x' } } }
    accounts.save(profile)
    expect(accounts.list()).toEqual([profile])
    accounts.remove('work')
    expect(accounts.list()).toEqual([])
  })

  it('rejects an unsafe account name', () => {
    expect(() => accounts.save({ name: '../evil', providers: {} })).toThrow(/invalid account name/)
  })
})
