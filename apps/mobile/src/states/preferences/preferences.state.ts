//State
import { create } from '../create'

//Constants
import { PREFERENCES } from './preferences.state.constants'

//Type
import type { PreferencesType } from './preferences.state.type'

/**
 * The person's choices about the app itself: how the home is laid out, and whatever its settings
 * come to hold. They belong to the phone, so forgetting the computer leaves them as they are.
 */
export const PreferencesStore = create<PreferencesType>()((set) => ({
  ...PREFERENCES,
  actions: {
    load: (preferences) => set(preferences),
    setView: (view) => set((state) => ({ home: { ...state.home, view } })),
    reset: () => {},
  },
}))
