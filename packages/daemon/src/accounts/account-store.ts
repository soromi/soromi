import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

//Packages
import { type AccountProfile, AccountProfileSchema } from '@soromi/protocol'

//
import { accountsDir } from './account-loader'

/** CRUD over the account profiles the daemon exposes to the UI. */
export interface AccountManager {
  list(): AccountProfile[]
  save(profile: AccountProfile): void
  remove(name: string): void
}

/** Account profiles stored under `~/.soromi/accounts/<name>/profile.json`. */
export class FileAccountManager implements AccountManager {
  list(): AccountProfile[] {
    const dir = accountsDir()
    if (!existsSync(dir)) return []
    const profiles: AccountProfile[] = []
    for (const name of readdirSync(dir)) {
      try {
        const raw = readFileSync(join(dir, name, 'profile.json'), 'utf8')
        const parsed = AccountProfileSchema.safeParse(JSON.parse(raw))
        if (parsed.success) profiles.push(parsed.data)
      } catch {
        // Skip anything that is not a readable, valid profile.
      }
    }
    return profiles.sort((a, b) => a.name.localeCompare(b.name))
  }

  save(profile: AccountProfile): void {
    const dir = join(accountsDir(), safeName(profile.name))
    mkdirSync(dir, { recursive: true })
    writeFileSync(join(dir, 'profile.json'), `${JSON.stringify(profile, null, 2)}\n`)
  }

  remove(name: string): void {
    rmSync(join(accountsDir(), safeName(name)), { recursive: true, force: true })
  }
}

function safeName(name: string): string {
  if (!/^[\w.-]+$/.test(name)) throw new Error(`invalid account name: ${name}`)
  return name
}
