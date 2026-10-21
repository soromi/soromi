import { useGlobalSearchParams } from 'expo-router'
import { useMemo } from 'react'
import { Animated, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

//Components
import { ResizeHandle } from '@/components'

//Config
import { layout } from '@/config/layout'
import { defineStyles, useThemedStyles } from '@/config/theme'

//Features
import { ComputerSwitcher } from '@/features/layout/components/computer-switcher'
import { NewWorkspaceAction } from '@/features/workspaces/components/new-action'
import { RouteBadge } from '@/features/layout/components/route-badge'
import { SessionList } from '@/features/sessions/components/list'
import { SettingsAction } from '@/features/settings/components/action'

//Hooks
import { useLayout } from '@/hooks/use-layout'
import { useResizable } from '@/hooks/use-resizable'
import { getSidebarMax } from '@/hooks/use-resizable.helpers'

//Constants
import { SIDEBAR } from './constants'

/**
 * The sessions column of a wide screen: what a phone has as its home, kept in view beside whatever
 * is open, the way the desktop keeps its sidebar. The session that is open is marked in it. Its
 * right edge is dragged to make it wider or narrower, and it stays that way.
 */
export const Sidebar = () => {
  const styles = useThemedStyles(makeStyles)
  const insets = useSafeAreaInsets()
  const params = useGlobalSearchParams<{ id?: string }>()
  const window = useLayout().width
  const resize = useResizable('sidebar', {
    fallback: layout.sidebar,
    min: layout.resize.sidebar.min,
    max: getSidebarMax(window),
    grows: 1,
  })

  // Clear of the status bar, and of a notch when the device is on its side.
  const inset = useMemo(
    () => ({ paddingTop: insets.top, paddingLeft: insets.left }),
    [insets.top, insets.left],
  )

  const size = useMemo(() => ({ width: resize.width }), [resize.width])

  return (
    <Animated.View style={[styles.root, size, inset]}>
      <View style={styles.header}>
        <View style={styles.title}>
          <ComputerSwitcher />
        </View>
        <RouteBadge />
        <NewWorkspaceAction />
        <SettingsAction />
      </View>
      <SessionList active={params.id} />
      <ResizeHandle
        edge="right"
        label={SIDEBAR.resize}
        onStart={resize.onStart}
        onMove={resize.onMove}
        onEnd={resize.onEnd}
        onStep={resize.onStep}
      />
    </Animated.View>
  )
}

const makeStyles = defineStyles((theme) => ({
  root: {
    borderRightWidth: theme.borderWidth.hairline,
    borderRightColor: theme.border.default,
    backgroundColor: theme.surface.page,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm2,
    minHeight: layout.header,
    paddingHorizontal: theme.spacing.md,
  },
  title: { flex: 1 },
}))
