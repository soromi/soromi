import { readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join, resolve } from 'node:path'

//Packages
import { type AccountProfile, AccountProfileSchema } from '@soromi/protocol'

/** Root of the account profile store. `SOROMI_HOME` overrides the default `~/.soromi`. */
export function accountsDir(): string {
  const base = process.env.SOROMI_HOME ?? join(homedir(), '.soromi')
  return join(base, 'accounts')
}

/** Reads and validates the profile at `<accountsDir>/<name>/profile.json`. */
export function loadAccountProfile(name: string, dir = accountsDir()): AccountProfile {
  const file = resolve(dir, name, 'profile.json')

  let raw: string
  try {
    raw = readFileSync(file, 'utf8')
  } catch {
    throw new Error(`account profile "${name}" not found (${file})`)
  }

  let json: unknown
  try {
    json = JSON.parse(raw)
  } catch {
    throw new Error(`account profile "${name}" is not valid JSON (${file})`)
  }

  const parsed = AccountProfileSchema.safeParse(json)
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((issue) => `${issue.path.join('.') || '(root)'}: ${issue.message}`)
      .join('; ')
    throw new Error(`account profile "${name}" is invalid (${file}): ${issues}`)
  }

  return parsed.data
}
