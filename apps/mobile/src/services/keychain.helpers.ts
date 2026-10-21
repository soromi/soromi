//Constants
import { PREFERENCES } from '@/states/preferences/preferences.state.constants'

//Type
import type { Preferences } from '@/states/preferences/preferences.state.type'
import type { Shell } from '@/states/workspace/workspace.state.type'

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

const isShell = (shell: unknown): shell is Shell => {
  if (typeof shell !== 'object' || shell === null) return false
  const fields = shell as Record<string, unknown>

  return (
    typeof fields.id === 'string' &&
    fields.id !== '' &&
    typeof fields.folder === 'string' &&
    typeof fields.title === 'string'
  )
}

/**
 * The terminals in what the keychain held, by workspace, or none where it cannot be read. A
 * workspace left with none is dropped.
 */
export const toShells = (stored: string | null): Record<string, Shell[]> => {
  if (!stored) return {}
  try {
    const lists: unknown = JSON.parse(stored)
    if (typeof lists !== 'object' || lists === null || Array.isArray(lists)) return {}
    const kept: Record<string, Shell[]> = {}
    for (const [workspace, shells] of Object.entries(lists)) {
      if (!Array.isArray(shells)) continue
      const valid = shells.filter(isShell)
      if (valid.length > 0) kept[workspace] = valid
    }

    return kept
  } catch {
    return {}
  }
}

/**
 * The preferences in what the keychain held. Whatever is missing or cannot be read is as the app
 * starts out, so a preference added later has its default for those who chose before it existed.
 */
export const toPreferences = (stored: string | null): Preferences => {
  if (!stored) return PREFERENCES
  try {
    const kept = JSON.parse(stored) as { home?: { view?: unknown } } | null
    const view = kept?.home?.view

    return { home: { view: view === 'grid' || view === 'list' ? view : PREFERENCES.home.view } }
  } catch {
    return PREFERENCES
  }
}
