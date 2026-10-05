//Utils
import { cn } from '../lib/utils'

/** One rendered diff row: an added/removed/context line, or a hunk header (`@@ … @@`). */
type Row = { kind: 'add' | 'del' | 'ctx'; text: string } | { kind: 'hunk'; text: string }

/**
 * Renders a unified diff (`git diff` output) read-only: hunk headers as subtle bands, additions in
 * green and removals in red, in a monospace panel. File headers (`diff --git`, `index`, `---`/`+++`)
 * are dropped since the panel already names the file. Handles new/deleted files (all +/-) for free.
 */
export function DiffViewer({ patch, truncated }: { patch: string; truncated?: boolean }) {
  if (patch.trim() === '') {
    return <div className="p-3 text-[12.5px] text-[var(--soromi-text-faint)]">No changes.</div>
  }
  if (/^Binary files? .* differ$/m.test(patch)) {
    return (
      <div className="p-3 text-[12.5px] text-[var(--soromi-text-faint)]">
        Binary file — not shown.
      </div>
    )
  }

  const rows = parse(patch)

  return (
    <div className="min-h-0 flex-1 overflow-auto text-[12.5px] [font-family:var(--soromi-font-mono)]">
      <div className="w-max min-w-full">
        {rows.map((row, i) => (
          // Rows are a static, positional list re-derived from `patch` each render — never reordered.
          // biome-ignore lint/suspicious/noArrayIndexKey: positional diff rows, no stable identity
          <DiffRow key={i} row={row} />
        ))}
      </div>
      {truncated && (
        <div className="px-3 py-2 text-[11px] text-[var(--soromi-text-faint)]">
          … diff truncated (large change)
        </div>
      )}
    </div>
  )
}

function DiffRow({ row }: { row: Row }) {
  if (row.kind === 'hunk') {
    return (
      <div className="whitespace-pre px-3 py-0.5 text-[11.5px] text-[var(--soromi-text-faint)] bg-[var(--soromi-bg-hover)]">
        {row.text}
      </div>
    )
  }
  return (
    <div
      className={cn(
        'whitespace-pre px-3 leading-[1.5]',
        row.kind === 'add' && 'bg-[#12321f] text-[var(--soromi-ok)]',
        row.kind === 'del' && 'bg-[#3a1717] text-[#f47070]',
        row.kind === 'ctx' && 'text-[var(--soromi-text-dim)]',
      )}
    >
      {row.text === '' ? ' ' : row.text}
    </div>
  )
}

/** Parses a unified diff into rows, keeping only hunk bodies (and their `@@` headers). */
function parse(patch: string): Row[] {
  const rows: Row[] = []
  let inHunk = false
  for (const line of patch.split('\n')) {
    if (line.startsWith('@@')) {
      inHunk = true
      rows.push({ kind: 'hunk', text: line })
      continue
    }
    if (!inHunk) continue // file headers before the first hunk
    if (line.startsWith('+')) rows.push({ kind: 'add', text: line.slice(1) })
    else if (line.startsWith('-')) rows.push({ kind: 'del', text: line.slice(1) })
    else if (line.startsWith('\\'))
      rows.push({ kind: 'ctx', text: line }) // "\ No newline at end"
    else rows.push({ kind: 'ctx', text: line.startsWith(' ') ? line.slice(1) : line })
  }
  return rows
}
