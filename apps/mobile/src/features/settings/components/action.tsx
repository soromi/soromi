import { usePathname, useRouter } from 'expo-router'
import { useCallback } from 'react'

//Components
import { IconButton } from '@/components'

//Config
import { routes } from '@/config/router'

//Constants
import { SETTINGS } from '../constants/settings'

/**
 * The gear in the header: opens the app's settings. Beside the sessions column it stays on screen
 * with the settings open, where a second tap must not open them again on top of themselves.
 */
export const SettingsAction = () => {
  const router = useRouter()
  const open = usePathname() === routes.app.settings

  const handlePress = useCallback(() => {
    if (!open) router.push(routes.app.settings)
  }, [router, open])

  return <IconButton icon="settings" label={SETTINGS.open} onPress={handlePress} />
}
