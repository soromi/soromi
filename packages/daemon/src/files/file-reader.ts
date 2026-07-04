import { closeSync, openSync, readSync, statSync } from 'node:fs'

//
import { resolveWithin } from './paths'

const MAX_BYTES = 256 * 1024

export interface FileRead {
  content: string
  /** The file was larger than the cap and only its head is returned. */
  truncated: boolean
  /** The file looks binary (has a null byte); content is empty. */
  binary: boolean
}

const EMPTY: FileRead = { content: '', truncated: false, binary: false }

/** Reads a file within a workspace, read-only and size-capped. Guards against escapes. */
export function readFileWithin(root: string, path: string): FileRead {
  const target = resolveWithin(root, path)
  if (target === null) return EMPTY

  try {
    const stat = statSync(target)
    if (!stat.isFile()) return EMPTY

    const toRead = Math.min(stat.size, MAX_BYTES)
    const buffer = Buffer.alloc(toRead)
    const fd = openSync(target, 'r')
    try {
      readSync(fd, buffer, 0, toRead, 0)
    } finally {
      closeSync(fd)
    }

    const binary = buffer.includes(0)
    return {
      content: binary ? '' : buffer.toString('utf8'),
      truncated: stat.size > MAX_BYTES,
      binary,
    }
  } catch {
    return EMPTY
  }
}
