import '@/config/runtime'

//Components
import { SystemBars } from '@/components'

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
      <SystemBars />
      <RootNavigator />
    </ThemeProvider>
  )
}
