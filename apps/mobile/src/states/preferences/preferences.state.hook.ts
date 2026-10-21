//State
import { PreferencesStore } from './preferences.state'

/**
 * @description How the home shows the sessions: as a list or as a grid
 */
export const usePreferencesView = () => PreferencesStore((state) => state.home.view)

/**
 * @description Preferences actions: a stable reference, so no shallow compare needed
 */
export const usePreferencesActions = () => PreferencesStore((state) => state.actions)
