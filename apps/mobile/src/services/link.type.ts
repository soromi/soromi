import type { ClientMessage, ServerMessage } from '@soromi/protocol'

/** A banner as the daemon sends it. */
export type BannerMessage = Extract<ServerMessage, { type: 'notify' }>

export type BannerListener = (banner: BannerMessage) => void

/** What a message that must not be lost is sent on: the link in use, or one made for it. */
export type ConfirmableLink = {
  send: (message: ClientMessage) => void
  /** Times a round trip now; the answer comes to `onLatency`. */
  measure: () => void
  isOpen: () => boolean
  onOpen: (listener: () => void) => () => void
  onLatency: (listener: (ms: number) => void) => () => void
}
