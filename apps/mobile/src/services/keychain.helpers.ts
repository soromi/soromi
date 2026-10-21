//Constants
import { PREFERENCES } from '@/states/preferences/preferences.state.constants'

//Type
import type { Pairing } from '@soromi/core'
import type { Computer } from '@/states/link/link.state.type'
import type { Preferences } from '@/states/preferences/preferences.state.type'

/** A pairing as kept, if it has all a link needs. */
export const toPairing = (value: unknown): Pairing | null => {
  if (typeof value !== 'object' || value === null) return null
  const fields = value as Record<string, unknown>
  const text = (key: string) => typeof fields[key] === 'string' && fields[key] !== ''

  return text('device') && text('relay') && text('room') && text('key') ? (value as Pairing) : null
}

/** The computers in what the keychain held; one that cannot be connected to is dropped. */
export const toComputers = (stored: string | null): Computer[] => {
  if (!stored) return []
  try {
    const kept: unknown = JSON.parse(stored)
    if (!Array.isArray(kept)) return []

    return kept.flatMap((entry) => {
      const pairing = toPairing((entry as Record<string, unknown> | null)?.pairing)
      if (!pairing) return []
      const name = (entry as Record<string, unknown>).name

      return [{ pairing, name: typeof name === 'string' && name !== '' ? name : null }]
    })
  } catch {
    return []
  }
}

/** A computer added to the list, or put in place of the one it already had with the same id. */
export const withComputer = (computers: Computer[], pairing: Pairing): Computer[] => {
  const known = computers.find((one) => one.pairing.device === pairing.device)
  if (!known) return [...computers, { pairing, name: null }]

  return computers.map((one) =>
    one.pairing.device === pairing.device ? { pairing, name: one.name } : one,
  )
}

/** The computer in use: the one named, else the first. */
export const getActiveComputer = (computers: Computer[], active: string | null): Computer | null =>
  computers.find((one) => one.pairing.device === active) ?? computers[0] ?? null

/** The routes in what the keychain held: a list of addresses, or nothing it can use. */
export const toRoutes = (stored: string | null): string[] => {
  if (!stored) return []
  try {
    const routes: unknown = JSON.parse(stored)
    if (!Array.isArray(routes)) return []

    return routes.filter((route): route is string => typeof route === 'string' && route !== '')
  } catch {
    return []
  }
}

/**
 * The preferences in what the keychain held. Whatever is missing or cannot be read is as the app
 * starts out, so a preference added later has its default for those who chose before it existed.
 */
export const toPreferences = (stored: string | null): Preferences => {
  if (!stored) return PREFERENCES
  try {
    const kept = JSON.parse(stored) as {
      home?: { view?: unknown }
      columns?: Record<string, unknown>
      appearance?: unknown
    } | null
    const appearance = kept?.appearance
    const view = kept?.home?.view
    // A width as it was kept, if it is one: anything else leaves the column as the app has it.
    const width = (value: unknown) =>
      typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : null

    return {
      home: { view: view === 'grid' || view === 'list' ? view : PREFERENCES.home.view },
      columns: {
        sidebar: width(kept?.columns?.sidebar),
        panel: width(kept?.columns?.panel),
      },
      appearance:
        appearance === 'light' || appearance === 'dark' || appearance === 'system'
          ? appearance
          : PREFERENCES.appearance,
    }
  } catch {
    return PREFERENCES
  }
}
