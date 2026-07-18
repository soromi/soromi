//Types
import type { DirEntry } from '@soromi/protocol'
import type { FileNode } from './file-tree'

/** Per-directory cache of listings and the set of open directories, keyed by full path. */
export interface TreeState {
  /** Listing for a directory path (`''` is the root). `undefined` = not fetched yet. */
  listings: Record<string, DirEntry[] | undefined>
  /** Whether a directory path is expanded. */
  expanded: Record<string, boolean>
  /** The currently open file path, if any (highlighted). */
  selected?: string
}

/**
 * Walks a lazily-loaded tree into the flat, in-order rows the shared FileTree renders. A directory
 * contributes its children only when it is both expanded and already listed, so callers fetch on
 * demand. Root entries are keyed by name; children by `parent/name`, matching the daemon's paths.
 */
export function flattenTree(state: TreeState): FileNode[] | undefined {
  const roots = state.listings['']
  if (roots === undefined) return undefined

  const rows: FileNode[] = []

  const walk = (entries: DirEntry[], parent: string, depth: number) => {
    for (const entry of entries) {
      const path = parent ? `${parent}/${entry.name}` : entry.name
      const expanded = entry.type === 'dir' && (state.expanded[path] ?? false)

      rows.push({
        path,
        name: entry.name,
        type: entry.type,
        ignored: entry.ignored,
        depth,
        expanded: entry.type === 'dir' ? expanded : undefined,
        selected: entry.type === 'file' ? state.selected === path : undefined,
      })

      const children = state.listings[path]
      if (expanded && children) walk(children, path, depth + 1)
    }
  }

  walk(roots, '', 0)
  return rows
}
