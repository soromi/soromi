import clsx from 'clsx'
import { useEffect } from 'react'
import { useShallow } from 'zustand/react/shallow'

//Services
import { useTransport } from '@/services/transport/transport-context'

//Store
import { useAppStore } from '@/stores/app-store'

//Styles
import styles from './file-tree.module.css'

/** Read-only project tree for the active workspace, lazy-loaded per folder from the daemon. */
export function FileTree() {
  const transport = useTransport()
  const { active, roots } = useAppStore(
    useShallow((s) => ({
      active: s.active,
      roots: s.active ? s.treeListings[s.active]?.[''] : undefined,
    })),
  )

  // Fetch the root listing the first time a workspace is shown; cached listings persist per
  // workspace, so switching back is instant and never re-fetches.
  useEffect(() => {
    if (active && useAppStore.getState().treeListings[active]?.[''] === undefined) {
      transport.send({ type: 'list-dir', workspace: active, path: '' })
    }
  }, [active, transport])

  if (!active) {
    return <div className={styles.empty}>Open a workspace to see its folders.</div>
  }

  return (
    <>
      {roots?.map((entry) => (
        <TreeNode
          key={entry.name}
          workspace={active}
          path={entry.name}
          name={entry.name}
          type={entry.type}
          ignored={entry.ignored}
          depth={0}
        />
      ))}
    </>
  )
}

interface TreeNodeProps {
  workspace: string
  path: string
  name: string
  type: 'file' | 'dir'
  ignored: boolean
  depth: number
}

function TreeNode({ workspace, path, name, type, ignored, depth }: TreeNodeProps) {
  const transport = useTransport()
  const { expanded, children, selected, toggle, openFile } = useAppStore(
    useShallow((s) => {
      const top = s.overlays.at(-1)
      return {
        expanded: s.treeExpanded[workspace]?.[path] ?? false,
        children: s.treeListings[workspace]?.[path],
        selected: top?.type === 'file' && top.path === path,
        toggle: s.toggleTreeNode,
        openFile: s.openFile,
      }
    }),
  )

  const indent = { paddingLeft: 8 + depth * 14 }

  if (type === 'file') {
    const open = () => {
      openFile(workspace, path)
      transport.send({ type: 'read-file', workspace, path })
    }
    return (
      <button
        type="button"
        className={clsx(
          styles.row,
          styles.file,
          selected && styles.selected,
          ignored && styles.ignored,
        )}
        style={indent}
        onClick={open}
        title={name}
      >
        <span className={styles.gap} />
        <span className={styles.label}>{name}</span>
      </button>
    )
  }

  const onToggle = () => {
    toggle(workspace, path)
    if (!expanded && children === undefined) {
      transport.send({ type: 'list-dir', workspace, path })
    }
  }

  return (
    <>
      <button
        type="button"
        className={clsx(styles.row, ignored && styles.ignored)}
        style={indent}
        onClick={onToggle}
        title={name}
      >
        <Chevron open={expanded} />
        <span className={styles.label}>{name}</span>
      </button>
      {expanded &&
        children?.map((child) => (
          <TreeNode
            key={child.name}
            workspace={workspace}
            path={`${path}/${child.name}`}
            name={child.name}
            type={child.type}
            ignored={child.ignored}
            depth={depth + 1}
          />
        ))}
    </>
  )
}

/** Disclosure chevron: points right when collapsed, rotates down when open. */
function Chevron({ open }: { open: boolean }) {
  return (
    <svg
      className={clsx(styles.chevron, open && styles.chevronOpen)}
      width={12}
      height={12}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M9 6l6 6-6 6" />
    </svg>
  )
}
