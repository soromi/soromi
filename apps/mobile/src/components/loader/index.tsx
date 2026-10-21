import { ActivityIndicator } from 'react-native'

//Config
import { useTheme } from '@/config/theme'

/** Stands in for content that is on its way. */
export const Loader = () => {
  const theme = useTheme()

  return <ActivityIndicator color={theme.text.muted} />
}
