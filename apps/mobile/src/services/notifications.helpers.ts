//Constants
import { NOTIFICATIONS } from './notifications.constants'

//Type
import type { Banner, BannerTarget } from './notifications.type'

/**
 * The name a banner is posted under. One per session: a session that finishes twice has one
 * banner, the latest, not a pile of them.
 */
export const getBannerId = (banner: Banner): string => banner.session ?? NOTIFICATIONS.general

/** What goes along with a banner, to be read back when it is tapped. */
export const toData = (banner: Banner): Record<string, unknown> =>
  banner.session ? { session: banner.session } : {}

/** What a tapped banner was about, from what went along with it; `null` when it names no session. */
export const toTarget = (data: unknown): BannerTarget | null => {
  if (typeof data !== 'object' || data === null) return null
  const session = (data as Record<string, unknown>).session

  return typeof session === 'string' && session !== '' ? { session } : null
}
