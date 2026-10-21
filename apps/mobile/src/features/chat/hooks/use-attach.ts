import { useEffect } from 'react'

//Services
import { LinkService } from '@/services/link'

//State
import { DaemonStore } from '@/states/daemon/daemon.state'

/**
 * Follows a session while its screen is up. Attaching makes the daemon bring the chat up to date
 * and stream what follows; the cursor of what is already held goes along, so coming back is only
 * sent what was missed. Leaving detaches, so nothing is streamed to a screen that is not showing.
 */
export const useAttach = (session: string) => {
  useEffect(() => {
    const attach = () =>
      LinkService.send({
        type: 'attach',
        session,
        chat: DaemonStore.getState().chatCursor[session],
      })
    attach()
    // The link came back: the daemon starts every connection from nothing.
    const off = LinkService.onOpen(attach)

    return () => {
      off()
      LinkService.send({ type: 'detach', session })
    }
  }, [session])
}
