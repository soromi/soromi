import { useCallback } from 'react'

//Components
import { Segmented, Text } from '@/components'

//Constants
import { SETTINGS } from '../constants/settings'

//State
import {
  usePreferencesActions,
  usePreferencesAppearance,
} from '@/states/preferences/preferences.state.hook'

//Type
import type { Appearance } from '@/states/preferences/preferences.state.type'

/** How the app looks: as the phone is set, or always light or dark. It changes at once. */
export const AppearanceChoice = () => {
  const appearance = usePreferencesAppearance()
  const actions = usePreferencesActions()

  const handleChange = useCallback(
    (id: string) => actions.setAppearance(id as Appearance),
    [actions],
  )

  return (
    <>
      <Text variant="bodySm" tone="body">
        {SETTINGS.appearance.about}
      </Text>
      <Segmented options={SETTINGS.appearance.options} value={appearance} onChange={handleChange} />
    </>
  )
}
