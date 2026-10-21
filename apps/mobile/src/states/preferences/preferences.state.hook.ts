//State
import { PreferencesStore } from './preferences.state'

//Type
import type { Column } from './preferences.state.type'

/**
 * @description How the home shows the sessions: as a list or as a grid
 */
export const usePreferencesView = () => PreferencesStore((state) => state.home.view)

/**
 * @description How wide a column of a wide screen was dragged to; `null` until it has been
 */
export const usePreferencesColumn = (column: Column) =>
  PreferencesStore((state) => state.columns[column])

/**
 * @description How the app looks: as the phone is set, or always light or dark
 */
export const usePreferencesAppearance = () => PreferencesStore((state) => state.appearance)

/**
 * @description Preferences actions: a stable reference, so no shallow compare needed
 */
export const usePreferencesActions = () => PreferencesStore((state) => state.actions)
