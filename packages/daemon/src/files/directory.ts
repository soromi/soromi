import { readdirSync } from 'node:fs'

//
import { resolveWithin } from './paths'

//Types
import type { DirEntry } from '@soromi/protocol'

/**
 * Lists a directory within a workspace, read-only. An empty path lists the workspace's
 * declared folders as top-level nodes, except a single `.` folder (the whole work folder),
 * which lists the root's own contents. Any other path is read from disk, guarded against
 * escaping the workspace root. Directories sort before files, then alphabetically.
 */
export function listDirectory(root: string, folders: string[], path: string): DirEntry[] {
  if (path === '' || path === '.') {
    if (folders.length === 1 && folders[0] === '.') {
      return readEntries(root)
    }
    return folders.map((name) => ({ name, type: 'dir' as const }))
  }

  const target = resolveWithin(root, path)
  if (target === null) return []
  return readEntries(target)
}

function readEntries(target: string): DirEntry[] {
  try {
    return readdirSync(target, { withFileTypes: true })
      .map((entry): DirEntry => ({ name: entry.name, type: entry.isDirectory() ? 'dir' : 'file' }))
      .sort(byDirsThenName)
  } catch {
    return []
  }
}

function byDirsThenName(a: DirEntry, b: DirEntry): number {
  if (a.type !== b.type) return a.type === 'dir' ? -1 : 1
  return a.name.localeCompare(b.name)
}
