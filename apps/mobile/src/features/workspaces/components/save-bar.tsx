import { useMemo } from 'react'
import { View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

//Components
import { Button, Text } from '@/components'

//Config
import { defineStyles, useTheme, useThemedStyles } from '@/config/theme'

//Constants
import { WORKSPACES } from '../constants/workspaces'

//Type
import type { SaveBarProps } from '../types'

/**
 * At the bottom of a workspace's settings while something in them has changed: that it has, and
 * the way to save it or put it back. It says so when the computer could not take it.
 */
export const SaveBar = (props: SaveBarProps) => {
  const theme = useTheme()
  const styles = useThemedStyles(makeStyles)
  const insets = useSafeAreaInsets()
  const copy = WORKSPACES.settings

  // Clear of the home indicator.
  const inset = useMemo(
    () => ({ paddingBottom: Math.max(insets.bottom, theme.spacing.sm2) }),
    [insets.bottom, theme],
  )

  return (
    <View style={[styles.bar, inset]}>
      <View style={styles.text}>
        <Text variant="bodySmSemiBold">{props.pending ? copy.pending : copy.unsaved}</Text>
        {props.error && (
          <Text variant="caption" tone="danger" numberOfLines={2}>
            {props.error}
          </Text>
        )}
      </View>
      <Button
        size="sm"
        variant="secondary"
        label={copy.discard}
        disabled={props.pending}
        onPress={props.onDiscard}
      />
      <Button
        size="sm"
        label={copy.save}
        disabled={props.pending || !props.valid}
        onPress={props.onSave}
      />
    </View>
  )
}

const makeStyles = defineStyles((theme) => ({
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
    paddingHorizontal: theme.spacing.md,
    paddingTop: theme.spacing.sm2,
    borderTopWidth: theme.borderWidth.hairline,
    borderTopColor: theme.border.default,
    backgroundColor: theme.surface.page,
  },
  text: { flex: 1, gap: theme.spacing.xxs },
}))
