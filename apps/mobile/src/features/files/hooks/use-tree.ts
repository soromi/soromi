import { useEffect, useMemo } from 'react'

import { flattenTree, unlistedDirs } from '@soromi/core'

//Services
import { LinkService } from '@/services/link'

//State
import { WorkspaceStore } from '@/states/workspace/workspace.state'
import { useWorkspaceExpanded, useWorkspaceListings } from '@/states/workspace/workspace.state.hook'

/**
 * A workspace's file tree as the rows to draw, fetched a folder at a time: the root when the tree
 * is first shown, and each folder when it is opened. `undefined` until the root has arrived.
 *
 * Listing a folder also makes the daemon send it again whenever it changes, for as long as this
 * connection lasts. So when the link comes back, every open folder is listed afresh.
 */
export const useTree = (workspace: string) => {
  const listings = useWorkspaceListings(workspace)
  const expanded = useWorkspaceExpanded(workspace)

  const state = useMemo(
    () => ({ listings: listings ?? {}, expanded: expanded ?? {} }),
    [listings, expanded],
  )

  useEffect(() => {
    for (const path of unlistedDirs(state)) {
      LinkService.send({ type: 'list-dir', workspace, path })
    }
  }, [workspace, state])

  useEffect(
    () =>
      LinkService.onOpen(() => {
        const tree = WorkspaceStore.getState().tree
        const open = Object.entries(tree.expanded[workspace] ?? {})
          .filter(([, isOpen]) => isOpen)
          .map(([path]) => path)
        for (const path of ['', ...open]) {
          LinkService.send({ type: 'list-dir', workspace, path })
        }
      }),
    [workspace],
  )

  return useMemo(() => flattenTree(state), [state])
}
