//Type
import type { Preferences } from './preferences.state.type'

/** What the app does until the person chooses otherwise. */
export const PREFERENCES: Preferences = {
  home: { view: 'list' },
  columns: { sidebar: null, panel: null },
  appearance: 'system',
}
