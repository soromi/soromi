import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'

//Packages
import { WorkspaceSchema } from '@soromi/protocol'
import { z } from 'zod'

/** A persisted space: the committable workspace config plus its absolute root on disk. */
export const PersistedSpaceSchema = WorkspaceSchema.extend({ root: z.string().min(1) })
export type PersistedSpace = z.infer<typeof PersistedSpaceSchema>

const PersistedSpacesSchema = z.array(PersistedSpaceSchema)

function spacesFile(): string {
  const base = process.env.SOROMI_HOME ?? join(homedir(), '.soromi')
  return join(base, 'spaces.json')
}

/** Loads persisted spaces; returns `[]` if the file is missing or invalid. */
export function loadSpaces(): PersistedSpace[] {
  try {
    const parsed = PersistedSpacesSchema.safeParse(JSON.parse(readFileSync(spacesFile(), 'utf8')))
    return parsed.success ? parsed.data : []
  } catch {
    return []
  }
}

/** Writes the current spaces to disk under `~/.soromi/` (or `SOROMI_HOME`). */
export function saveSpaces(spaces: PersistedSpace[]): void {
  const file = spacesFile()
  mkdirSync(dirname(file), { recursive: true })
  writeFileSync(file, `${JSON.stringify(spaces, null, 2)}\n`)
}
