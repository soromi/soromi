//Type
import type { ShellSummary } from '@soromi/protocol'

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

/** Whether `candidate` is `path` itself or something inside it. */
export const isWithin = (candidate: string, path: string): boolean =>
  candidate === path || candidate.startsWith(`${path}/`)

/** The folder a path is in, relative to the workspace root: `''` for one at the top. */
export const getParentPath = (path: string): string =>
  path.includes('/') ? path.slice(0, path.lastIndexOf('/')) : ''

/** A record of paths without the ones `drop` picks. */
export const withoutPaths = <T>(
  record: Record<string, T> | undefined,
  drop: (path: string) => boolean,
): Record<string, T> =>
  Object.fromEntries(Object.entries(record ?? {}).filter(([path]) => !drop(path)))

/** A new terminal's id. The app names it, and the daemon knows it by that name from then on. */
export const newShellId = (): string => {
  const bytes = globalThis.crypto.getRandomValues(new Uint8Array(16))

  return `shell:${Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('')}`
}

/**
 * The terminal that takes a closed one's place on screen: the one after it, or the one before it
 * when it was the last. `undefined` when it was the only one.
 */
export const getShellAfter = (shells: ShellSummary[], closed: string): string | undefined => {
  const index = shells.findIndex((shell) => shell.id === closed)
  const rest = shells.filter((shell) => shell.id !== closed)

  return (rest[index] ?? rest[index - 1])?.id
}
