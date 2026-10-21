import { useMemo } from 'react'
import { View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

//Components
import { Text } from '@/components'

//Config
import { layout } from '@/config/layout'
import { defineStyles, useThemedStyles } from '@/config/theme'

//Type
import type { ScreenHeaderProps } from '../types'

/**
 * The top row of a screen on a wide layout, drawn by the app in place of the navigator's own
 * header: the title at the left, as the desktop has it, and the screen's actions at the right. It
 * is as tall as the rows at the top of the columns beside it, so a session's panel can open on
 * that same line and its icons stay where the eye left them.
 */
export const ScreenHeader = (props: ScreenHeaderProps) => {
  const styles = useThemedStyles(makeStyles)
  const insets = useSafeAreaInsets()

  // Clear of the status bar, and of a rounded corner when the device is on its side.
  const inset = useMemo(
    () => ({ paddingTop: insets.top, paddingRight: insets.right }),
    [insets.top, insets.right],
  )

  return (
    <View style={inset}>
      <View style={styles.row}>
        {props.leading}
        <Text
          variant="bodySemiBold"
          accessibilityRole="header"
          numberOfLines={1}
          style={styles.title}
        >
          {props.title}
        </Text>
        {props.children}
      </View>
    </View>
  )
}

const makeStyles = defineStyles((theme) => ({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm2,
    minHeight: layout.header,
    paddingHorizontal: theme.spacing.md,
  },
  title: { flex: 1 },
}))
