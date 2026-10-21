/**
 * What a workspace's git state is kept under for one of its folders (`''` is the root). A newline
 * cannot be part of either name.
 */
export function repoKey(workspace: string, folder: string): string {
  return `${workspace}\n${folder}`
}

/** What a repository is called among a workspace's: its folder's own name, or `root` for the root. */
export function repoLabel(folder: string, root = 'root'): string {
  return folder.split('/').filter(Boolean).pop() ?? root
}

/**
 * The folder to show instead, once the status of `folder` has come back with the workspace's
 * repositories, or `null` to stay. A workspace that is a folder of several repositories has
 * nothing to show at its root: the first of them is shown in its place.
 */
export function repoToShow(folder: string, isRepo: boolean, repos: string[]): string | null {
  if (isRepo || repos.length === 0 || repos.includes(folder)) return null

  return repos[0]
}
