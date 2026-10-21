import { Redirect, Stack } from 'expo-router'
import { useMemo } from 'react'
import { View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

//Components
import { Loader } from '@/components'

//Config
import { routes } from '@/config/router'
import { defineStyles, useThemedStyles } from '@/config/theme'

//Features
import { ComputerSwitcher } from '@/features/layout/components/computer-switcher'
import { ControlBar } from '@/features/layout/components/control-bar'
import { LinkBanner } from '@/features/layout/components/link-banner'
import { RouteBadge } from '@/features/layout/components/route-badge'
import { SessionPlaceholder } from '@/features/sessions/components/placeholder'
import { WorkspaceList } from '@/features/sessions/components/workspaces'
import { SettingsAction } from '@/features/settings/components/action'
import { NewWorkspaceAction } from '@/features/workspaces/components/new-action'

//Helpers
import { getHeaderActions } from '@/features/layout/helpers'

//Hooks
import { useLayout } from '@/hooks/use-layout'

//State
import { useLinkLoaded, useLinkOnline, useLinkPaired } from '@/states/link/link.state.hook'

/**
 * Home. On a phone: what needs the person, from every workspace, then the workspaces on the
 * computer, live, each a tap away from its own screen. On a tablet the sessions have a column of
 * their own (see `Sidebar`), so home is the space beside it, waiting for one to be picked.
 */
export const SessionsScreen = () => {
  const styles = useThemedStyles(makeStyles)
  const layout = useLayout()
  const loaded = useLinkLoaded()
  const paired = useLinkPaired()
  const online = useLinkOnline()
  const wide = layout.wide
  const insets = useSafeAreaInsets()

  const options = useMemo(
    () => ({
      // The column has the title and these actions when it is there.
      headerShown: !wide,
      headerTitle: () => <ComputerSwitcher />,
      ...getHeaderActions(() => (
        <View style={styles.actions}>
          <RouteBadge />
          <NewWorkspaceAction />
          <SettingsAction />
        </View>
      )),
    }),
    [styles, wide],
  )

  // With no header of its own (the column has it), nothing else keeps the screen clear of the
  // status bar: the banners at its top would sit under the clock and the battery.
  const inset = useMemo(
    () => (wide ? { paddingTop: insets.top, paddingRight: insets.right } : null),
    [wide, insets.top, insets.right],
  )

  // The keychain has not been read yet: nothing can be said about pairing.
  if (!loaded) {
    return (
      <View style={styles.center}>
        <Loader />
      </View>
    )
  }
  if (!paired) return <Redirect href={routes.pairing.pair} />

  return (
    <View style={[styles.root, inset]}>
      <Stack.Screen options={options} />
      <LinkBanner />
      <ControlBar />
      {wide && <SessionPlaceholder online={online} />}
      {!wide && <WorkspaceList />}
    </View>
  )
}

const makeStyles = defineStyles((theme) => ({
  root: { flex: 1, backgroundColor: theme.surface.page },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  actions: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm2 },
}))
