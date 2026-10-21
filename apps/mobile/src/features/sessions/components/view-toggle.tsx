import { useCallback } from 'react'

//Components
import { IconButton } from '@/components'

//Constants
import { SESSIONS } from '../constants/sessions'

//Helpers
import { getOtherView } from '../helpers'

//State
import {
  usePreferencesActions,
  usePreferencesView,
} from '@/states/preferences/preferences.state.hook'

/**
 * The header's switch between the home's two views. It shows the one it changes to, and the
 * choice is kept for the next time the app opens.
 */
export const ViewToggle = () => {
  const view = usePreferencesView()
  const actions = usePreferencesActions()
  const other = getOtherView(view)

  const handlePress = useCallback(() => actions.setView(other), [actions, other])

  return <IconButton icon={other} label={SESSIONS.view[other]} onPress={handlePress} />
}
