//Components
import { FileIcon, FolderIcon } from './file-icon'

//Utils
import { cn } from '../lib/utils'

//Types
import type { MouseEvent as ReactMouseEvent } from 'react'

/** One row of the tree, already flattened in render order by the host (respecting expansion). */
export interface FileNode {
  /** Full path, unique per row and used as the React key. */
  path: string
  name: string
  type: 'file' | 'dir'
  ignored: boolean
  /** Nesting level, 0 at the root; drives the indent. */
  depth: number
  /** Directories: whether they are open (rotates the chevron). */
  expanded?: boolean
  /** Files: whether this is the open file (highlighted). */
  selected?: boolean
}

export interface FileTreeProps {
  /** The visible rows, flattened top-to-bottom. `undefined` while the root listing loads. */
  nodes: FileNode[] | undefined
  /** Toggle a directory open/closed (the host lazy-loads children and re-flattens). */
  onToggleDir: (path: string) => void
  /** Open a file (the host decides what that means: preview, no-op on web, …). */
  onOpenFile: (path: string) => void
  /** Optional right-click handler (desktop context menu); omitted on touch/web. */
  onContextMenu?: (event: ReactMouseEvent, node: FileNode) => void
  /** Message when there is nothing to show. */
  emptyLabel?: string
}

/**
 * Presentational project tree: renders already-flattened rows with indent + a disclosure chevron.
 * All state (expansion, listing cache, fetching) and any context menu live in the host, so the
 * same rows render on desktop and web.
 */
export function FileTree({
  nodes,
  onToggleDir,
  onOpenFile,
  onContextMenu,
  emptyLabel = 'Nothing here.',
}: FileTreeProps) {
  if (nodes === undefined)
    return <div className="px-2 py-1 text-[var(--soromi-text-faint)]">Loading…</div>
  if (nodes.length === 0)
    return <div className="px-2 py-1 text-[var(--soromi-text-faint)]">{emptyLabel}</div>

  return (
    <>
      {nodes.map((node) => (
        <button
          key={node.path}
          type="button"
          className={cn(
            'flex w-full cursor-pointer items-center gap-[5px] overflow-hidden border-none bg-transparent px-2 py-1 text-left text-xs text-[var(--soromi-text)] transition-colors select-none hover:bg-[var(--soromi-bg-hover)]',
            node.type === 'file' && '[font-family:var(--soromi-font-mono)]',
            node.selected && 'bg-[var(--soromi-bg-active)] text-[var(--soromi-text)]',
            node.ignored && 'text-[var(--soromi-text-faint)]',
          )}
          style={{ paddingLeft: 8 + node.depth * 14 }}
          onClick={() => (node.type === 'dir' ? onToggleDir(node.path) : onOpenFile(node.path))}
          onContextMenu={onContextMenu ? (event) => onContextMenu(event, node) : undefined}
          title={node.name}
        >
          {node.type === 'dir' ? (
            <svg
              width="12"
              height="12"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              className={cn(
                'h-3 w-3 flex-shrink-0 text-[var(--soromi-text-faint)] transition-transform duration-[120ms]',
                node.expanded && 'rotate-90',
              )}
              aria-hidden="true"
            >
              <path d="M9 6l6 6-6 6" />
            </svg>
          ) : (
            <span className="w-3 flex-shrink-0" />
          )}
          {node.type === 'dir' ? <FolderIcon /> : <FileIcon name={node.name} />}
          <span className="min-w-0 flex-1 overflow-hidden text-ellipsis whitespace-nowrap">
            {node.name}
          </span>
        </button>
      ))}
    </>
  )
}
