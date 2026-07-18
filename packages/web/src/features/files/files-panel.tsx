import { useEffect } from 'react'
import { useShallow } from 'zustand/react/shallow'

//Packages
import { useTransport } from '@soromi/client'
import { FileTree, flattenTree } from '@soromi/ui'

//Store
import { useUiStore } from '@/stores/ui-store'

//Styles
import styles from './files-panel.module.css'

/** The Files view: the active workspace's tree, lazy-loaded per folder from the daemon. */
export function FilesPanel({
  workspace,
  showHeading = true,
}: {
  workspace?: string
  showHeading?: boolean
}) {
  const transport = useTransport()
  const { listings, expanded, toggleTreeNode, openFile } = useUiStore(
    useShallow((s) => ({
      listings: workspace ? s.treeListings[workspace] : undefined,
      expanded: workspace ? s.treeExpanded[workspace] : undefined,
      toggleTreeNode: s.toggleTreeNode,
      openFile: s.openFile,
    })),
  )

  // Fetch the root listing when missing.
  useEffect(() => {
    if (workspace && listings?.[''] === undefined) {
      transport.send({ type: 'list-dir', workspace, path: '' })
    }
  }, [workspace, listings, transport])

  // Fetch children for any directory that is open but not yet listed.
  useEffect(() => {
    if (!workspace || !expanded) return
    for (const [path, isOpen] of Object.entries(expanded)) {
      if (isOpen && listings?.[path] === undefined) {
        transport.send({ type: 'list-dir', workspace, path })
      }
    }
  }, [workspace, expanded, listings, transport])

  const nodes = flattenTree({ listings: listings ?? {}, expanded: expanded ?? {} })

  const onOpenFile = (path: string) => {
    if (!workspace) return
    openFile(workspace, path)
    transport.send({ type: 'read-file', workspace, path })
  }

  return (
    <section className={styles.panel}>
      {showHeading && <h2 className={styles.heading}>Files</h2>}
      <div className={styles.list}>
        {!workspace ? (
          <div className={styles.empty}>No workspace</div>
        ) : (
          <FileTree
            nodes={nodes}
            onToggleDir={(path) => toggleTreeNode(workspace, path)}
            onOpenFile={onOpenFile}
            emptyLabel="No folders."
          />
        )}
      </div>
    </section>
  )
}
