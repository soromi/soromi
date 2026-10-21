import { relayClose } from '@soromi/core'

//Type
import type { IncompatibleAction } from '@soromi/protocol'
import type { LinkStatus } from '@/states/link/link.state.type'

/** What a dropped socket means for the link, from the code it closed with. */
export const getStatusFromClose = (code: number): LinkStatus => {
  if (code === relayClose.noHost) return 'computer-offline'
  if (code === relayClose.replaced) return 'replaced'

  return 'connecting'
}

/**
 * Where the link stands after a socket dropped. A drop that says nothing of why leaves what is
 * already known in place: while the computer cannot be reached every attempt to reach it ends in
 * such a drop, and each would otherwise put "connecting" back up for a moment.
 */
export const getStatusAfterClose = (current: LinkStatus, code: number): LinkStatus => {
  const next = getStatusFromClose(code)

  return next === 'connecting' && current === 'computer-offline' ? current : next
}

/** The states from which trying again is worth saying so: the link is down, and may come back. */
export const isRetryable = (status: LinkStatus): boolean =>
  status === 'computer-offline' || status === 'replaced'

/** Which side has to update, when the daemon and the app cannot talk. */
export const getStatusFromIncompatible = (action: IncompatibleAction): LinkStatus =>
  action === 'update-client' ? 'update-app' : 'update-desktop'
