import { useEffect } from 'react'

//Services
import { LinkService } from '@/services/link'

//State
import { useWorkspaceFile } from '@/states/workspace/workspace.state.hook'

/**
 * A file's content, asked for when its screen opens and again whenever the link comes back, so
 * what shows is what is on disk. `undefined` until the first answer.
 */
export const useFile = (workspace: string, path: string) => {
  const file = useWorkspaceFile(workspace, path)

  useEffect(() => {
    const read = () => LinkService.send({ type: 'read-file', workspace, path })
    read()

    return LinkService.onOpen(read)
  }, [workspace, path])

  return file
}
