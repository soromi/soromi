import { resolve, sep } from 'node:path'

/** Resolves a workspace-relative path, or `null` if it escapes the workspace root. */
export function resolveWithin(root: string, path: string): string | null {
  const target = resolve(root, path)
  if (target !== root && !target.startsWith(root + sep)) return null
  return target
}
