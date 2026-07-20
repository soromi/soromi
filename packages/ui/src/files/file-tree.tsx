import clsx from 'clsx'

//Components
import { FileIcon, FolderIcon } from './file-icon'

//Styles
import styles from './file-tree.module.css'

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
  if (nodes === undefined) return <div className={styles.empty}>Loading…</div>
  if (nodes.length === 0) return <div className={styles.empty}>{emptyLabel}</div>

  return (
    <>
      {nodes.map((node) => (
        <button
          key={node.path}
          type="button"
          className={clsx(
            styles.row,
            node.type === 'file' && styles.file,
            node.selected && styles.selected,
            node.ignored && styles.ignored,
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
              className={clsx(styles.chevron, node.expanded && styles.chevronOpen)}
              aria-hidden="true"
            >
              <path d="M9 6l6 6-6 6" />
            </svg>
          ) : (
            <span className={styles.gap} />
          )}
          {node.type === 'dir' ? <FolderIcon /> : <FileIcon name={node.name} />}
          <span className={styles.label}>{node.name}</span>
        </button>
      ))}
    </>
  )
}
