/** How the home shows the sessions: one under the other, or as cards side by side. */
export type SessionsView = 'list' | 'grid'

/** How the app looks: as the phone is set (light by day, dark by night, say), or always one way. */
export type Appearance = 'system' | 'light' | 'dark'

/** The columns of a wide screen whose width the person can drag. */
export type Column = 'sidebar' | 'panel'

/** What the person has chosen about the app itself. Kept on the phone, whatever it is paired with. */
export type Preferences = {
  home: {
    view: SessionsView
  }
  /** How wide each column was dragged to, in points; `null` until it has been. */
  columns: Record<Column, number | null>
  appearance: Appearance
}

export type PreferencesActions = {
  /** What was kept from the last time the app ran. */
  load: (preferences: Preferences) => void
  setView: (view: SessionsView) => void
  /** A column was dragged to this width; `null` puts it back as the app has it. */
  setColumn: (column: Column, width: number | null) => void
  setAppearance: (appearance: Appearance) => void
  /** Unpairing clears what came from the computer. These did not. */
  reset: () => void
}

export type PreferencesType = Preferences & {
  /** Grouped so the object stays reference-stable: `usePreferencesActions` needs no shallow compare. */
  actions: PreferencesActions
}
