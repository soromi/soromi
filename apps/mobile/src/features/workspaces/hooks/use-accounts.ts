import { useEffect } from 'react'

//Services
import { LinkService } from '@/services/link'

//State
import { useDaemonAccounts } from '@/states/daemon/daemon.state.hook'

/**
 * The account profiles set up on the computer, which a workspace's agents can be bound to. Asked
 * for when a form that offers them opens, and again when the link comes back.
 */
export const useAccounts = () => {
  const accounts = useDaemonAccounts()

  useEffect(() => {
    const ask = () => LinkService.send({ type: 'list-accounts' })
    ask()

    return LinkService.onOpen(ask)
  }, [])

  return accounts ?? []
}
