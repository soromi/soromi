import { useRouter } from 'expo-router'
import { useCallback } from 'react'

//Components
import { IconButton } from '@/components'

//Config
import { routes } from '@/config/router'

//Constants
import { SETTINGS } from '../constants/settings'

/** The gear in the header: opens the app's settings. */
export const SettingsAction = () => {
  const router = useRouter()

  const handlePress = useCallback(() => router.push(routes.app.settings), [router])

  return <IconButton icon="settings" label={SETTINGS.open} onPress={handlePress} />
}
