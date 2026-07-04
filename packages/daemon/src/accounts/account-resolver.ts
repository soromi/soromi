import { homedir } from 'node:os'
import { join } from 'node:path'

//Types
import type { AccountProfile } from '@soromi/protocol'

/** Expands a leading `~` to the home directory; leaves other values untouched. */
export function expandHome(value: string, home = homedir()): string {
  if (value === '~') return home
  if (value.startsWith('~/')) return join(home, value.slice(2))
  return value
}

export interface ResolvedLaunch {
  env: NodeJS.ProcessEnv
  /** Config directories to create before launch (from the provider's `configDir`). */
  ensureDirs: string[]
}

/**
 * Produces the environment to launch a provider's agent under, isolated by the account
 * profile. The profile's per-provider env is layered over the base env (values expanded),
 * so the daemon needs no per-provider knowledge. A provider absent from the profile
 * launches under the base env unchanged.
 */
export function resolveLaunchEnv(
  profile: AccountProfile,
  providerKey: string,
  baseEnv: NodeJS.ProcessEnv,
): ResolvedLaunch {
  const provider = profile.providers[providerKey]
  if (!provider) return { env: { ...baseEnv }, ensureDirs: [] }

  const env: NodeJS.ProcessEnv = { ...baseEnv }
  for (const [key, value] of Object.entries(provider.env ?? {})) {
    env[key] = expandHome(value)
  }

  const ensureDirs = provider.configDir ? [expandHome(provider.configDir)] : []
  return { env, ensureDirs }
}
