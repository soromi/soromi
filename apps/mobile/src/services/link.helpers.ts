import { relayClose } from '@soromi/core'

//Type
import type { ClientMessage, IncompatibleAction } from '@soromi/protocol'
import type { LinkStatus } from '@/states/link/link.state.type'
import type { ConfirmableLink } from './link.type'

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

/**
 * Sends a message on `link` once it is up, and says whether the computer has it: `true` when the
 * daemon has answered a round trip timed after it (it reads a link's messages in the order they
 * come), `false` if that has not happened within `ms`.
 */
export const confirmSend = (
  link: ConfirmableLink,
  message: ClientMessage,
  ms: number,
): Promise<boolean> =>
  new Promise((resolve) => {
    let sent = false
    let done = false
    const stops: Array<() => void> = []
    const finish = (ok: boolean) => {
      if (done) return
      done = true
      clearTimeout(timer)
      for (const stop of stops) stop()
      resolve(ok)
    }
    const timer = setTimeout(() => finish(false), Math.max(0, ms))
    const send = () => {
      if (sent) return
      sent = true
      link.send(message)
      link.measure()
    }
    stops.push(
      link.onLatency(() => {
        if (sent) finish(true)
      }),
    )
    stops.push(link.onOpen(send))
    if (link.isOpen()) send()
  })

/** A relay's address as the phone dials it: `ws://` or `wss://`, a host (and a port), maybe a path. */
export const isRelayAddress = (url: string): boolean =>
  /^wss?:\/\/[A-Za-z0-9.-]+(:\d{1,5})?(\/\S*)?$/.test(url)
