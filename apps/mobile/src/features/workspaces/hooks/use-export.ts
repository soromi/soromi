import { useCallback, useEffect, useState } from 'react'

//Services
import { LinkService } from '@/services/link'

/**
 * Writes a workspace to a `soromi.space.json` in its folder, on the computer, and says where it
 * went once the computer has.
 */
export const useExport = (workspace: string) => {
  const [path, setPath] = useState<string | null>(null)

  useEffect(
    () =>
      LinkService.onMessage((message) => {
        if (message.type === 'space-exported' && message.workspace === workspace) {
          setPath(message.path)
        }
      }),
    [workspace],
  )

  const handleExport = useCallback(() => {
    setPath(null)
    LinkService.send({ type: 'export-space', workspace })
  }, [workspace])

  return { path, handleExport }
}
