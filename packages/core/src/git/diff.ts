/** One row of a diff: an added, removed or unchanged line, or a hunk header (`@@ … @@`). */
export type DiffRow = { kind: 'add' | 'del' | 'ctx'; text: string } | { kind: 'hunk'; text: string }

/** Whether a patch is git's note that a binary file changed, which has no lines to show. */
export function isBinaryDiff(patch: string): boolean {
  return /^Binary files? .* differ$/m.test(patch)
}

/**
 * Parses a unified diff (`git diff` output) into rows, keeping only hunk bodies and their `@@`
 * headers. File headers (`diff --git`, `index`, `---`/`+++`) are dropped: whoever shows the diff
 * already names the file. New and deleted files come out as all additions or all removals.
 */
export function parseDiff(patch: string): DiffRow[] {
  const rows: DiffRow[] = []
  let inHunk = false
  // A patch ends with a newline, which is the end of its last line and not a line of its own.
  const lines = patch.endsWith('\n') ? patch.slice(0, -1).split('\n') : patch.split('\n')
  for (const line of lines) {
    if (line.startsWith('@@')) {
      inHunk = true
      rows.push({ kind: 'hunk', text: line })
      continue
    }
    // File headers before the first hunk.
    if (!inHunk) continue
    if (line.startsWith('+')) rows.push({ kind: 'add', text: line.slice(1) })
    else if (line.startsWith('-')) rows.push({ kind: 'del', text: line.slice(1) })
    // "\ No newline at end of file"
    else if (line.startsWith('\\')) rows.push({ kind: 'ctx', text: line })
    else rows.push({ kind: 'ctx', text: line.startsWith(' ') ? line.slice(1) : line })
  }

  return rows
}
