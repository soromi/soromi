//Types
import type { GitChange } from '@soromi/protocol'

/** A working tree's changes, as a source-control view groups them. */
export interface GroupedChanges {
  /** In the index, ready to commit. */
  staged: GitChange[]
  /** Changed in the working tree and not staged. */
  unstaged: GitChange[]
  /** New files git does not track yet. */
  untracked: GitChange[]
}

/**
 * Sorts changes into staged, unstaged and untracked. A file changed in both the index and the
 * working tree appears in both of the first two.
 */
export function groupChanges(changes: GitChange[]): GroupedChanges {
  return {
    staged: changes.filter((change) => change.index !== '' && change.index !== '?'),
    unstaged: changes.filter((change) => change.worktree !== '' && change.worktree !== '?'),
    untracked: changes.filter((change) => change.worktree === '?'),
  }
}

/** A path as a file name and the folder it sits in (`''` at the top). */
export function splitPath(path: string): { name: string; dir: string } {
  const slash = path.lastIndexOf('/')

  return slash < 0
    ? { name: path, dir: '' }
    : { name: path.slice(slash + 1), dir: path.slice(0, slash) }
}
