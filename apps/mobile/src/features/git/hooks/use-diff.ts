import { useEffect } from 'react'

//Services
import { LinkService } from '@/services/link'

//State
import { useWorkspaceDiff } from '@/states/workspace/workspace.state.hook'

/**
 * One changed file's diff, in the repository at `folder` of the workspace, asked for when its screen opens and again whenever the link comes
 * back. `undefined` until the first answer.
 */
export const useDiff = (workspace: string, folder: string, path: string, staged: boolean) => {
  const diff = useWorkspaceDiff(workspace, folder, path, staged)

  useEffect(() => {
    const ask = () => LinkService.send({ type: 'git-diff', workspace, folder, path, staged })
    ask()

    return LinkService.onOpen(ask)
  }, [workspace, folder, path, staged])

  return diff
}
