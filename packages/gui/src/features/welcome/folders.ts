/** Strips trailing slashes; leaves a bare root (`/`) intact. */
function normalize(path: string): string {
  const trimmed = path.trim().replace(/\/+$/, '')
  return trimmed || path.trim()
}

/** Last path segment, e.g. `/a/b` -> `b`. */
export function basename(path: string): string {
  return normalize(path).split('/').pop() || path
}

/**
 * Maps one or more picked folders to the workspace model: a single work-folder root (the
 * agent's cwd) and each folder's path relative to it. One folder is its own root with the whole
 * tree (`.`). Several folders share their longest common parent as the root; a folder that is
 * the root itself maps to `.`.
 */
export function deriveRootAndFolders(paths: string[]): { root: string; folders: string[] } {
  const cleaned = [...new Set(paths.map(normalize).filter(Boolean))]
  if (cleaned.length === 0) return { root: '', folders: [] }
  if (cleaned.length === 1) return { root: cleaned[0], folders: ['.'] }

  const segments = cleaned.map((p) => p.split('/'))
  const first = segments[0]
  let common = 0
  while (common < first.length && segments.every((seg) => seg[common] === first[common])) {
    common++
  }
  const root = first.slice(0, common).join('/') || '/'
  const folders = segments.map((seg) => seg.slice(common).join('/') || '.')
  return { root, folders }
}
