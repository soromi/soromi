//Constants
import { SETTINGS } from './constants/settings'

//Helpers
import { isRelayAddress } from '@/services/link.helpers'

//Type
import type { HostInfo } from '@soromi/protocol'
import type { LatencyGrade, LatencySummary, RelayDraft } from './types'

/**
 * What is typed in the relay box, as the relay address it would be kept as (trimmed, without a
 * trailing slash), and whether it is not the one in use. As on the computer, a bare host is taken
 * as `wss://`, and a web address as the WebSocket one on its host (`https://` as `wss://`).
 */
export const getRelayDraft = (text: string, current: string | undefined): RelayDraft => {
  const typed = text
    .trim()
    .replace(/\/+$/, '')
    .replace(/^https:\/\//, 'wss://')
    .replace(/^http:\/\//, 'ws://')
  const address = typed === '' || typed.includes('://') ? typed : `wss://${typed}`
  const url = isRelayAddress(address) ? address : null

  return { url, changed: url !== null && url !== current }
}

/** "macOS · Soromi desktop app": the computer's system, and what runs Soromi on it. */
export const getHostDetail = (host: HostInfo): string =>
  [SETTINGS.computer.os[host.os] ?? host.os, SETTINGS.computer.launcher[host.launcher]].join(
    SETTINGS.computer.separator,
  )

/** The latest round trip, the average of those kept, and how it feels; `null` before the first. */
export const getLatencySummary = (samples: number[]): LatencySummary | null => {
  const last = samples.at(-1)
  if (last === undefined) return null
  const average = samples.reduce((sum, ms) => sum + ms, 0) / samples.length

  return { last, average, grade: getLatencyGrade(average) }
}

/** Graded on the average, so one slow answer does not turn the view red. */
export const getLatencyGrade = (ms: number): LatencyGrade => {
  const grades = SETTINGS.connection.grades
  if (ms <= grades.good) return 'good'

  return ms <= grades.fair ? 'fair' : 'poor'
}

/** "42 s", "12 min", "3 h 5 min": how long the link has been up. */
export const formatDuration = (ms: number): string => {
  const unit = SETTINGS.connection.duration
  const seconds = Math.max(0, Math.floor(ms / 1000))
  if (seconds < 60) return `${seconds} ${unit.seconds}`
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes} ${unit.minutes}`
  const hours = Math.floor(minutes / 60)
  const rest = minutes % 60

  return rest ? `${hours} ${unit.hours} ${rest} ${unit.minutes}` : `${hours} ${unit.hours}`
}
