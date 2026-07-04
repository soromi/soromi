import { homedir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

//
import { expandHome, resolveLaunchEnv } from './account-resolver'

//Types
import type { AccountProfile } from '@soromi/protocol'

function profile(providers: AccountProfile['providers']): AccountProfile {
  return { name: 'personal', providers }
}

describe('expandHome', () => {
  it('expands a bare tilde and a ~/ prefix', () => {
    expect(expandHome('~', '/home/tester')).toBe('/home/tester')
    expect(expandHome('~/x/y', '/home/tester')).toBe('/home/tester/x/y')
  })

  it('leaves non-tilde values untouched', () => {
    expect(expandHome('/abs/path', '/home/tester')).toBe('/abs/path')
    expect(expandHome('sk-token', '/home/tester')).toBe('sk-token')
  })
})

describe('resolveLaunchEnv', () => {
  it('layers provider env over the base env', () => {
    const p = profile({ claude: { env: { CLAUDE_CONFIG_DIR: '/c', TOKEN: 'x' } } })
    const { env } = resolveLaunchEnv(p, 'claude', { PATH: '/bin' })
    expect(env.PATH).toBe('/bin')
    expect(env.CLAUDE_CONFIG_DIR).toBe('/c')
    expect(env.TOKEN).toBe('x')
  })

  it('expands ~ in provider env values', () => {
    const p = profile({ claude: { env: { CLAUDE_CONFIG_DIR: '~/c' } } })
    const { env } = resolveLaunchEnv(p, 'claude', {})
    expect(env.CLAUDE_CONFIG_DIR).toBe(join(homedir(), 'c'))
  })

  it('reports configDir in ensureDirs', () => {
    const p = profile({ claude: { configDir: '/data/claude' } })
    expect(resolveLaunchEnv(p, 'claude', {}).ensureDirs).toEqual(['/data/claude'])
  })

  it('falls back to base env when the provider is absent', () => {
    const p = profile({ claude: { env: { X: '1' } } })
    const { env, ensureDirs } = resolveLaunchEnv(p, 'codex', { PATH: '/bin' })
    expect(env).toEqual({ PATH: '/bin' })
    expect(ensureDirs).toEqual([])
  })
})
