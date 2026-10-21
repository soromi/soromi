//Constants
import { NOTIFICATIONS } from './notifications.constants'

//Type
import type { Banner, BannerAnswer, BannerAnswered, BannerTarget } from './notifications.type'

/**
 * The name a banner is posted under. One per session: a session that finishes twice has one
 * banner, the latest, not a pile of them.
 */
export const getBannerId = (banner: Banner): string => banner.session ?? NOTIFICATIONS.general

/** What goes along with a banner, to be read back when it is tapped. */
export const toData = (banner: Banner): Record<string, unknown> => ({
  ...(banner.session ? { session: banner.session } : {}),
  ...(banner.approval ? { approval: banner.approval } : {}),
})

/** The answer one of a banner's buttons gives, or `null` for a plain tap. */
export const toAnswer = (action: string | undefined): BannerAnswer | null => {
  const { allow, deny } = NOTIFICATIONS.approval
  if (action === allow.id) return allow.id

  return action === deny.id ? deny.id : null
}

/** What a tapped banner was about, from what went along with it; `null` when it names no session. */
export const toTarget = (data: unknown): BannerTarget | null => {
  if (typeof data !== 'object' || data === null) return null
  const fields = data as Record<string, unknown>
  const session = fields.session
  if (typeof session !== 'string' || session === '') return null
  const text = (key: string) =>
    typeof fields[key] === 'string' && fields[key] !== '' ? (fields[key] as string) : undefined
  const device = text('device')
  const approval = text('approval')

  return {
    session,
    ...(device ? { device } : {}),
    ...(approval ? { approval } : {}),
  }
}

/** A notification's data as a push brings it on Android in a task: as text, at times. */
const parseData = (text: unknown): unknown => {
  if (typeof text !== 'string') return undefined
  try {
    return JSON.parse(text)
  } catch {
    return undefined
  }
}

/**
 * What a tapped banner was about, from the system's account of the tap (a notification response),
 * with the button it was answered with and the banner's own name; `null` when it names no
 * session.
 */
export const toResponseTarget = (response: unknown): BannerTarget | null => {
  if (typeof response !== 'object' || response === null) return null
  const tap = response as {
    actionIdentifier?: unknown
    notification?: { request?: { identifier?: unknown; content?: Record<string, unknown> } }
  }
  const request = tap.notification?.request
  const content = request?.content
  const data =
    typeof content?.data === 'object' && content.data !== null
      ? content.data
      : parseData(content?.dataString)
  const target = toTarget(data)
  if (!target) return null
  const answer = toAnswer(
    typeof tap.actionIdentifier === 'string' ? tap.actionIdentifier : undefined,
  )
  const banner = typeof request?.identifier === 'string' ? request.identifier : undefined

  return { ...target, ...(answer ? { answer } : {}), ...(banner ? { banner } : {}) }
}

/** The tool request a tap answered, when it was one of the buttons of a banner about one. */
export const toAnswered = (target: BannerTarget | null): BannerAnswered | null =>
  target?.answer && target.approval
    ? { ...target, answer: target.answer, approval: target.approval }
    : null
