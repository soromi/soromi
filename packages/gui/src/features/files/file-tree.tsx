import clsx from 'clsx'
import { useEffect, useState } from 'react'
import { useShallow } from 'zustand/react/shallow'

//Packages
import { useClientStore, useTransport } from '@soromi/client'
import { FileTree as FileTreeView, flattenTree } from '@soromi/ui'

//Store
import { useAppStore } from '@/stores/app-store'

//Utils
import { copyText, revealInFinder } from '@/lib/host'

//Constants
import { isTauri } from '@/config'

//Styles
import styles from './file-tree.module.css'

//Types
import type { FileNode } from '@soromi/ui'
import type { MouseEvent as ReactMouseEvent } from 'react'

interface MenuTarget {
  x: number
  y: number
  path: string
  name: string
  type: 'file' | 'dir'
}

/** Read-only project tree for the active workspace, lazy-loaded per folder from the daemon. */
export function FileTree() {
  const transport = useTransport()
  const { active, listings, expanded, selectedFile } = useAppStore(
    useShallow((s) => {
      const top = s.overlays.at(-1)
      return {
        active: s.active,
        listings: s.active ? s.treeListings[s.active] : undefined,
        expanded: s.active ? s.treeExpanded[s.active] : undefined,
        selectedFile: top?.type === 'file' ? top.path : undefined,
      }
    }),
  )
  const { toggleTreeNode, openFile } = useAppStore(
    useShallow((s) => ({ toggleTreeNode: s.toggleTreeNode, openFile: s.openFile })),
  )
  const [menu, setMenu] = useState<MenuTarget | null>(null)

  // Fetch the root listing whenever it is missing: on first show, and again after the cache is
  // cleared. Cached listings persist per workspace, so switching back is instant.
  useEffect(() => {
    if (active && listings?.[''] === undefined) {
      transport.send({ type: 'list-dir', workspace: active, path: '' })
    }
  }, [active, listings, transport])

  // Fetch children for any directory that is expanded but not yet listed (first expand, or after
  // the cache was cleared while it stayed open).
  useEffect(() => {
    if (!active || !expanded) return
    for (const [path, isOpen] of Object.entries(expanded)) {
      if (isOpen && listings?.[path] === undefined) {
        transport.send({ type: 'list-dir', workspace: active, path })
      }
    }
  }, [active, expanded, listings, transport])

  if (!active) {
    return <div className={styles.empty}>Open a workspace to see its folders.</div>
  }

  const nodes = flattenTree({
    listings: listings ?? {},
    expanded: expanded ?? {},
    selected: selectedFile,
  })

  const onOpenFile = (path: string) => {
    openFile(active, path)
    transport.send({ type: 'read-file', workspace: active, path })
  }
  const onContextMenu = (event: ReactMouseEvent, node: FileNode) => {
    event.preventDefault()
    setMenu({
      x: event.clientX,
      y: event.clientY,
      path: node.path,
      name: node.name,
      type: node.type,
    })
  }

  return (
    <>
      <FileTreeView
        nodes={nodes}
        onToggleDir={(path) => toggleTreeNode(active, path)}
        onOpenFile={onOpenFile}
        onContextMenu={onContextMenu}
        emptyLabel="No folders."
      />
      {menu && <ContextMenu workspace={active} menu={menu} onClose={() => setMenu(null)} />}
    </>
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
