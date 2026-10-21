import { useGlobalSearchParams } from 'expo-router'
import { useMemo } from 'react'
import { View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

//Config
import { layout } from '@/config/layout'
import { defineStyles, useThemedStyles } from '@/config/theme'

//Features
import { Brand } from '@/features/layout/components/brand'
import { RouteBadge } from '@/features/layout/components/route-badge'
import { SessionList } from '@/features/sessions/components/list'
import { SettingsAction } from '@/features/settings/components/action'

/**
 * The sessions column of a wide screen: what a phone has as its home, kept in view beside whatever
 * is open, the way the desktop keeps its sidebar. The session that is open is marked in it.
 */
export const Sidebar = () => {
  const styles = useThemedStyles(makeStyles)
  const insets = useSafeAreaInsets()
  const params = useGlobalSearchParams<{ id?: string }>()

  // Clear of the status bar, and of a notch when the device is on its side.
  const inset = useMemo(
    () => ({ paddingTop: insets.top, paddingLeft: insets.left }),
    [insets.top, insets.left],
  )

  return (
    <View style={[styles.root, inset]}>
      <View style={styles.header}>
        <View style={styles.title}>
          <Brand />
        </View>
        <RouteBadge />
        <SettingsAction />
      </View>
      <SessionList active={params.id} />
    </View>
  )
}

const makeStyles = defineStyles((theme) => ({
  root: {
    width: layout.sidebar,
    borderRightWidth: theme.borderWidth.hairline,
    borderRightColor: theme.border.default,
    backgroundColor: theme.surface.page,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm2,
    minHeight: 52,
    paddingHorizontal: theme.spacing.md,
  },
  title: { flex: 1 },
}))
