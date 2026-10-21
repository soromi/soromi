import { StatusBar } from 'expo-status-bar'

//Config
import { useTheme } from '@/config/theme'

/**
 * The system's own bars over the app (the clock, the battery), drawn to read on its appearance:
 * light on the dark one, dark on the light one. This is the only place that imports the status bar.
 */
export const SystemBars = () => {
  const theme = useTheme()

  return <StatusBar style={theme.scheme === 'dark' ? 'light' : 'dark'} />
}
