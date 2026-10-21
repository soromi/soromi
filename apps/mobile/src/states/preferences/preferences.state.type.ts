/** How the home shows the sessions: one under the other, or as cards side by side. */
export type SessionsView = 'list' | 'grid'

/** What the person has chosen about the app itself. Kept on the phone, whatever it is paired with. */
export type Preferences = {
  home: {
    view: SessionsView
  }
}

export type PreferencesActions = {
  /** What was kept from the last time the app ran. */
  load: (preferences: Preferences) => void
  setView: (view: SessionsView) => void
  /** Unpairing clears what came from the computer. These did not. */
  reset: () => void
}

export type PreferencesType = Preferences & {
  /** Grouped so the object stays reference-stable: `usePreferencesActions` needs no shallow compare. */
  actions: PreferencesActions
}
