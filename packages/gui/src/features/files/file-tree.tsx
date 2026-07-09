import clsx from 'clsx'
import { createContext, useContext, useEffect, useState } from 'react'
import { useShallow } from 'zustand/react/shallow'

//Packages
import { useClientStore, useTransport } from '@soromi/client'

//Store
import { useAppStore } from '@/stores/app-store'

//Utils
import { copyText, revealInFinder } from '@/lib/host'

//Constants
import { isTauri } from '@/config'

//Icons
import ChevronSvg from '@/assets/icons/chevron.svg?react'

//Styles
import styles from './file-tree.module.css'

//Types
import type { MouseEvent as ReactMouseEvent } from 'react'

interface MenuTarget {
  x: number
  y: number
  path: string
  name: string
  type: 'file' | 'dir'
}

type OpenMenu = (event: ReactMouseEvent, path: string, name: string, type: 'file' | 'dir') => void

// Passed down the recursive tree so any node can open the shared context menu.
const OpenMenuContext = createContext<OpenMenu>(() => {})

/** Read-only project tree for the active workspace, lazy-loaded per folder from the daemon. */
export function FileTree() {
  const transport = useTransport()
  const { active, roots } = useAppStore(
    useShallow((s) => ({
      active: s.active,
      roots: s.active ? s.treeListings[s.active]?.[''] : undefined,
    })),
  )
  const [menu, setMenu] = useState<MenuTarget | null>(null)

  const openMenu: OpenMenu = (event, path, name, type) => {
    event.preventDefault()
    setMenu({ x: event.clientX, y: event.clientY, path, name, type })
  }

  // Fetch the root listing whenever it is missing: on first show, and again after the cache is
  // cleared (e.g. its folders changed). Cached listings persist per workspace, so switching back
  // is instant and never re-fetches.
  useEffect(() => {
    if (active && roots === undefined) {
      transport.send({ type: 'list-dir', workspace: active, path: '' })
    }
  }, [active, roots, transport])

  if (!active) {
    return <div className={styles.empty}>Open a workspace to see its folders.</div>
  }

  return (
    <OpenMenuContext.Provider value={openMenu}>
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
      {menu && <ContextMenu workspace={active} menu={menu} onClose={() => setMenu(null)} />}
    </OpenMenuContext.Provider>
  )
}

/** The custom right-click popup: read-only actions plus removing a workspace folder. */
function ContextMenu({
  workspace,
  menu,
  onClose,
}: {
  workspace: string
  menu: MenuTarget
  onClose: () => void
}) {
  const transport = useTransport()
  const summary = useClientStore((s) => s.workspaces.find((w) => w.name === workspace))
  const resetTree = useAppStore((s) => s.resetTree)

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const absolute = summary ? `${summary.root}/${menu.path}` : menu.path
  // A workspace folder is a top-level node whose path is one of the declared folders (never `.`).
  const isWorkspaceFolder = (summary?.folders ?? []).includes(menu.path) && menu.path !== '.'
  const canRemoveFolder = isWorkspaceFolder && (summary?.folders.length ?? 0) > 1

  const run = (action: () => void) => {
    action()
    onClose()
  }
  const removeFolder = () => {
    if (!summary) return
    const folders = summary.folders.filter((folder) => folder !== menu.path)
    transport.send({
      type: 'update-space',
      workspace,
      accounts: summary.accounts,
      folders,
      instructions: summary.instructions ?? undefined,
    })
    resetTree(workspace)
  }

  return (
    // biome-ignore lint/a11y/useKeyWithClickEvents: backdrop dismissal; Escape is handled above.
    // biome-ignore lint/a11y/noStaticElementInteractions: an invisible click-away backdrop, not a control.
    <div className={styles.backdrop} onClick={onClose} onContextMenu={(e) => e.preventDefault()}>
      <div className={styles.menu} style={{ top: menu.y, left: menu.x }}>
        <button
          type="button"
          className={styles.menuItem}
          onClick={() => run(() => copyText(absolute))}
        >
          Copy path
        </button>
        {isTauri && (
          <button
            type="button"
            className={styles.menuItem}
            onClick={() => run(() => revealInFinder(absolute))}
          >
            Reveal in Finder
          </button>
        )}
        {canRemoveFolder && (
          <>
            <div className={styles.menuDivider} />
            <button
              type="button"
              className={clsx(styles.menuItem, styles.menuDanger)}
              onClick={() => run(removeFolder)}
            >
              Remove from workspace
            </button>
          </>
        )}
      </div>
    </div>
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
  const openMenu = useContext(OpenMenuContext)
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
        onContextMenu={(event) => openMenu(event, path, name, type)}
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
        onContextMenu={(event) => openMenu(event, path, name, type)}
        title={name}
      >
        <ChevronSvg
          width={12}
          height={12}
          className={clsx(styles.chevron, expanded && styles.chevronOpen)}
        />
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
