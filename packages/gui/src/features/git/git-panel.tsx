import { useEffect } from 'react'
import { useShallow } from 'zustand/react/shallow'

//Packages
import { useTransport } from '@soromi/client'
import { cn } from '@soromi/ui'

//Store
import { useAppStore } from '@/stores/app-store'

//Types
import type { GitChange } from '@soromi/protocol'

/**
 * Read-only git source-control view for the active workspace: the current branch, and the changed
 * files grouped into Staged / Changes / Untracked. Clicking a file opens its diff in the docked
 * panel. No mutations yet (stage/commit/etc. are a later, gated addition).
 */
export function GitPanel() {
  const transport = useTransport()
  const { active, status, openDiffPath } = useAppStore(
    useShallow((s) => {
      const top = s.overlays.at(-1)
      return {
        active: s.active,
        status: s.active ? s.gitStatus[s.active] : undefined,
        openDiffPath: top?.type === 'diff' ? top.path : undefined,
      }
    }),
  )
  const openDiff = useAppStore((s) => s.openDiff)

  const refresh = () => {
    if (active) transport.send({ type: 'git-status', workspace: active })
  }

  // Fetch status on first show and whenever the active workspace changes.
  useEffect(() => {
    if (active && status === undefined) {
      transport.send({ type: 'git-status', workspace: active })
    }
  }, [active, status, transport])

  if (!active) {
    return (
      <div className="px-2 py-1 text-[var(--soromi-text-faint)]">
        Open a workspace to see its changes.
      </div>
    )
  }
  if (status === undefined) {
    return <div className="px-2 py-1 text-[var(--soromi-text-faint)]">Loading…</div>
  }
  if (!status.isRepo) {
    return <div className="px-2 py-1 text-[var(--soromi-text-faint)]">Not a git repository.</div>
  }

  const staged = status.changes.filter((c) => c.index !== '' && c.index !== '?')
  const unstaged = status.changes.filter((c) => c.worktree !== '' && c.worktree !== '?')
  const untracked = status.changes.filter((c) => c.worktree === '?')
  const clean = staged.length + unstaged.length + untracked.length === 0

  const onOpen = (change: GitChange, isStaged: boolean) => {
    openDiff(active, change.path, isStaged)
    transport.send({ type: 'git-diff', workspace: active, path: change.path, staged: isStaged })
  }

  return (
    <div>
      <div className="flex items-center gap-1.5 px-2 pb-2">
        <GitBranchGlyph />
        <span className="min-w-0 flex-1 overflow-hidden text-ellipsis whitespace-nowrap font-medium text-[12.5px] text-[var(--soromi-text-dim)]">
          {status.branch ?? 'detached'}
        </span>
        {(status.ahead > 0 || status.behind > 0) && (
          <span className="flex-none text-[11px] text-[var(--soromi-text-faint)]">
            {status.ahead > 0 && `↑${status.ahead}`}
            {status.behind > 0 && ` ↓${status.behind}`}
          </span>
        )}
        <button
          type="button"
          title="Refresh"
          onClick={refresh}
          className="flex h-[22px] w-[22px] flex-none cursor-pointer appearance-none items-center justify-center rounded-md border-none bg-transparent text-[var(--soromi-text-faint)] hover:bg-[var(--soromi-bg-hover)] hover:text-[var(--soromi-text-dim)]"
        >
          <svg
            width="13"
            height="13"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M21 12a9 9 0 1 1-2.64-6.36M21 3v6h-6" />
          </svg>
        </button>
      </div>

      {clean ? (
        <div className="px-2 py-1 text-[var(--soromi-text-faint)]">No changes.</div>
      ) : (
        <div>
          <Section label="Staged" count={staged.length}>
            {staged.map((c) => (
              <Row
                key={`s-${c.path}`}
                change={c}
                letter={c.index}
                active={openDiffPath === c.path}
                onClick={() => onOpen(c, true)}
              />
            ))}
          </Section>
          <Section label="Changes" count={unstaged.length}>
            {unstaged.map((c) => (
              <Row
                key={`u-${c.path}`}
                change={c}
                letter={c.worktree}
                active={openDiffPath === c.path}
                onClick={() => onOpen(c, false)}
              />
            ))}
          </Section>
          <Section label="Untracked" count={untracked.length}>
            {untracked.map((c) => (
              <Row
                key={`t-${c.path}`}
                change={c}
                letter="U"
                active={openDiffPath === c.path}
                onClick={() => onOpen(c, false)}
              />
            ))}
          </Section>
        </div>
      )}
    </div>
  )
}

function Section({
  label,
  count,
  children,
}: {
  label: string
  count: number
  children: React.ReactNode
}) {
  if (count === 0) return null
  return (
    <div className="pb-1">
      <div className="px-2 pt-2 pb-1 font-semibold text-[10.5px] text-[var(--soromi-text-faint)] uppercase tracking-[0.08em]">
        {label} · {count}
      </div>
      {children}
    </div>
  )
}

function Row({
  change,
  letter,
  active,
  onClick,
}: {
  change: GitChange
  letter: string
  active: boolean
  onClick: () => void
}) {
  const dir = change.path.includes('/') ? change.path.slice(0, change.path.lastIndexOf('/')) : ''
  const name = change.path.slice(change.path.lastIndexOf('/') + 1)
  return (
    <button
      type="button"
      onClick={onClick}
      title={change.path}
      className={cn(
        'flex w-full cursor-pointer appearance-none items-center gap-2 border-none bg-transparent px-2 py-[3px] text-left hover:bg-[var(--soromi-bg-hover)]',
        active && 'bg-[var(--soromi-bg-hover)]',
      )}
    >
      <span className="min-w-0 flex-1 truncate text-[12.5px] text-[var(--soromi-text-dim)]">
        {name}
        {dir && <span className="ml-1.5 text-[11px] text-[var(--soromi-text-faint)]">{dir}</span>}
      </span>
      <span
        className={cn(
          'flex-none font-semibold text-[11px] [font-family:var(--soromi-font-mono)]',
          statusColor(letter),
        )}
      >
        {letter}
      </span>
    </button>
  )
}

/** Tailwind color class for a status letter (M modified, A added, D deleted, R renamed, U/?). */
function statusColor(letter: string): string {
  switch (letter) {
    case 'A':
      return 'text-[var(--soromi-ok)]'
    case 'D':
      return 'text-[#f47070]'
    case 'M':
      return 'text-[#e0b341]'
    case 'R':
    case 'C':
      return 'text-[#6b93d6]'
    default:
      return 'text-[var(--soromi-text-faint)]'
  }
}

function GitBranchGlyph() {
  return (
    <svg
      width="13"
      height="13"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.9"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className="flex-none text-[var(--soromi-text-faint)]"
    >
      <line x1="6" y1="3" x2="6" y2="15" />
      <circle cx="18" cy="6" r="3" />
      <circle cx="6" cy="18" r="3" />
      <path d="M18 9a9 9 0 0 1-9 9" />
    </svg>
  )
}
