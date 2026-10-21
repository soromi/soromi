import { Stack } from 'expo-router'
import { useMemo } from 'react'
import { View } from 'react-native'

//Config
import { defineStyles, useTheme, useThemedStyles } from '@/config/theme'

//Constants
import { NAVIGATION } from '@/features/layout/constants/navigation'

//Hooks
import { useBanners } from '@/features/sessions/hooks/use-banners'
import { useLayout } from '@/hooks/use-layout'

//Screens
import { Sidebar } from '@/screens/shared/sidebar'

//State
import { useLinkPaired } from '@/states/link/link.state.hook'

/**
 * The app's one navigator: a stack, in the app's colours. On a wide screen (a tablet, a large
 * phone on its side) the sessions get a column of their own at its left, as on the desktop, and
 * the stack is what is open beside it.
 *
 * The stack keeps its place in the tree whichever way the screen is laid out, so turning the
 * device does not start the navigation over.
 */
export const RootNavigator = () => {
  const theme = useTheme()
  const styles = useThemedStyles(makeStyles)
  const layout = useLayout()
  const paired = useLinkPaired()

  useBanners()

  const screenOptions = useMemo(
    () => ({
      headerStyle: { backgroundColor: theme.surface.page },
      headerTintColor: theme.text.heading,
      headerShadowVisible: false,
      contentStyle: { backgroundColor: theme.surface.page },
    }),
    [theme],
  )

  return (
    <View style={styles.root}>
      {layout.wide && paired && <Sidebar />}
      <View style={styles.main}>
        <Stack screenOptions={screenOptions}>
          <Stack.Screen name="index" options={NAVIGATION.screens.sessions} />
          <Stack.Screen name="settings" options={NAVIGATION.screens.settings} />
          <Stack.Screen name="pair" options={NAVIGATION.screens.pair} />
          <Stack.Screen name="session/[id]/index" options={NAVIGATION.screens.session} />
          <Stack.Screen name="session/[id]/panel" options={NAVIGATION.screens.panel} />
          <Stack.Screen name="workspace/[name]/file" options={NAVIGATION.screens.file} />
          <Stack.Screen name="workspace/[name]/diff" options={NAVIGATION.screens.diff} />
        </Stack>
      </View>
    </View>
  )
}

const makeStyles = defineStyles((theme) => ({
  root: { flex: 1, flexDirection: 'row', backgroundColor: theme.surface.page },
  main: { flex: 1 },
}))
