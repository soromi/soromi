import { useCallback, useEffect, useState } from 'react'

//Services
import { LinkService } from '@/services/link'

//State
import { WorkspaceStore } from '@/states/workspace/workspace.state'
import { useWorkspaceFolderListing } from '@/states/workspace/workspace.state.hook'

/**
 * The computer's folders, one at a time, while a picker is open: it starts where it was last left
 * (the home folder the first time), and `go` lists another. The daemon's answer lands in the
 * workspace store; from asking until an answer or an error comes back, it is still looking.
 */
export const useFolderBrowser = (visible: boolean) => {
  const listing = useWorkspaceFolderListing()
  const [waiting, setWaiting] = useState(false)

  const go = useCallback((path?: string) => {
    setWaiting(true)
    LinkService.send({ type: 'browse-folders', path })
  }, [])

  // Each answer, or a refusal (a folder that cannot be read), ends the wait.
  // biome-ignore lint/correctness/useExhaustiveDependencies: a new listing is the answer.
  useEffect(() => setWaiting(false), [listing])
  useEffect(
    () =>
      LinkService.onMessage((message) => {
        if (message.type === 'error') setWaiting(false)
      }),
    [],
  )

  // Listed afresh each time the picker opens, and again when the link comes back.
  useEffect(() => {
    if (!visible) return
    const again = () => go(WorkspaceStore.getState().browse.listing?.path)
    again()

    return LinkService.onOpen(again)
  }, [visible, go])

  return { listing, loading: waiting || listing === null, go }
}
