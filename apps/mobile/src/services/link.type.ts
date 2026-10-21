import type { ServerMessage } from '@soromi/protocol'

/** A banner as the daemon sends it. */
export type BannerMessage = Extract<ServerMessage, { type: 'notify' }>

export type BannerListener = (banner: BannerMessage) => void
