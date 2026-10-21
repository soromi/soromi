//Type
import type { Shell } from './workspace.state.type'

/** What a file's content is kept under. A newline cannot be part of either name. */
export const getFileKey = (workspace: string, path: string): string => `${workspace}\n${path}`

/**
 * What a diff is kept under: the repository it is in (a folder of the workspace), the file, and
 * which diff of it, since the staged and the unstaged one are different things.
 */
export const getDiffKey = (
  workspace: string,
  folder: string,
  path: string,
  staged: boolean,
): string => `${workspace}\n${folder}\n${path}\n${staged ? 'staged' : 'worktree'}`

/** A new terminal's id. The app names it, and the daemon knows it by that name from then on. */
export const newShellId = (): string => {
  const bytes = globalThis.crypto.getRandomValues(new Uint8Array(16))

  return `shell:${Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('')}`
}

/**
 * What a terminal is called: the folder it starts in, numbered when another one open in the
 * workspace already has that name.
 */
export const getShellTitle = (folder: string, root: string, peers: Shell[]): string => {
  const base = folder.split('/').filter(Boolean).pop() ?? root
  const taken = new Set(peers.map((peer) => peer.title))
  if (!taken.has(base)) return base
  let index = 2
  while (taken.has(`${base} ${index}`)) index += 1

  return `${base} ${index}`
}

/**
 * The terminal that takes a closed one's place on screen: the one after it, or the one before it
 * when it was the last. `undefined` when it was the only one.
 */
export const getShellAfter = (shells: Shell[], closed: string): string | undefined => {
  const index = shells.findIndex((shell) => shell.id === closed)
  const rest = shells.filter((shell) => shell.id !== closed)

  return (rest[index] ?? rest[index - 1])?.id
}
