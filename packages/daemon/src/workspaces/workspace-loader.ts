import { readFileSync } from 'node:fs'
import { isAbsolute, resolve } from 'node:path'

//Packages
import { type Workspace, WorkspaceSchema } from '@soromi/protocol'

export interface LoadedWorkspace {
  workspace: Workspace
  /** Absolute path to the work-folder root that holds the folders. */
  root: string
}

/** Reads and validates `<dir>/soromi.space.json`, resolving the work-folder root. */
export function loadWorkspace(dir: string): LoadedWorkspace {
  const root = isAbsolute(dir) ? dir : resolve(process.cwd(), dir)
  const file = resolve(root, 'soromi.space.json')

  let raw: string
  try {
    raw = readFileSync(file, 'utf8')
  } catch {
    throw new Error(`no soromi.space.json found at ${file}`)
  }

  let json: unknown
  try {
    json = JSON.parse(raw)
  } catch {
    throw new Error(`soromi.space.json is not valid JSON: ${file}`)
  }

  const parsed = WorkspaceSchema.safeParse(json)
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((issue) => `${issue.path.join('.') || '(root)'}: ${issue.message}`)
      .join('; ')
    throw new Error(`soromi.space.json is invalid (${file}): ${issues}`)
  }

  return { workspace: parsed.data, root }
}
