import '@/config/runtime'

import { StatusBar } from 'expo-status-bar'

//Config
import { ThemeProvider } from '@/config/theme'

//Hooks
import { useLinkBoot } from '@/hooks/use-link-boot'

//Screens
import { RootNavigator } from '@/screens/root'

export default function RootLayout() {
  useLinkBoot()

  return (
    <ThemeProvider>
      <StatusBar style="light" />
      <RootNavigator />
    </ThemeProvider>
  )
}
