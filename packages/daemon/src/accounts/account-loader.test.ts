import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

//
import { loadAccountProfile } from './account-loader'

let dir: string

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'soromi-acct-'))
})
afterEach(() => {
  rmSync(dir, { recursive: true, force: true })
})

function writeProfile(name: string, content: string): void {
  const profileDir = join(dir, name)
  mkdirSync(profileDir, { recursive: true })
  writeFileSync(join(profileDir, 'profile.json'), content)
}

describe('loadAccountProfile', () => {
  it('loads a valid profile', () => {
    writeProfile(
      'personal',
      JSON.stringify({ name: 'personal', providers: { claude: { env: { X: '1' } } } }),
    )
    const p = loadAccountProfile('personal', dir)
    expect(p.name).toBe('personal')
    expect(p.providers.claude?.env?.X).toBe('1')
  })

  it('throws when the profile is missing', () => {
    expect(() => loadAccountProfile('nope', dir)).toThrow(/not found/)
  })

  it('throws on invalid JSON', () => {
    writeProfile('bad', '{ nope')
    expect(() => loadAccountProfile('bad', dir)).toThrow(/not valid JSON/)
  })

  it('throws on a schema violation (missing providers)', () => {
    writeProfile('bad2', JSON.stringify({ name: 'bad2' }))
    expect(() => loadAccountProfile('bad2', dir)).toThrow(/invalid/)
  })
})
