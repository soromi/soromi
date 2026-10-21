import { usageAgentName } from '@soromi/core'
import { useCallback } from 'react'
import { Linking, Pressable } from 'react-native'

//Components
import { Icon, Text } from '@/components'

//Config
import { defineStyles, useThemedStyles } from '@/config/theme'

//Constants
import { USAGE } from '../constants/usage'

//Type
import type { PressableStateCallbackType } from 'react-native'
import type { ManagePlanProps } from '../types'

/** At the foot of an agent's card: its plan page, in the browser. */
export const ManagePlan = (props: ManagePlanProps) => {
  const styles = useThemedStyles(makeStyles)
  const url = props.url

  const handlePress = useCallback(() => void Linking.openURL(url), [url])

  const getStyle = useCallback(
    (state: PressableStateCallbackType) => [styles.row, state.pressed && styles.pressed],
    [styles],
  )

  return (
    <Pressable
      accessibilityRole="link"
      accessibilityHint={USAGE.manageHint}
      style={getStyle}
      onPress={handlePress}
    >
      <Text variant="bodySm" tone="body" style={styles.label}>
        {USAGE.manage(usageAgentName(props.agent))}
      </Text>
      <Icon name="external" size={14} />
    </Pressable>
  )
}

const makeStyles = defineStyles((theme) => ({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm2,
    minHeight: theme.control.md,
    paddingHorizontal: theme.spacing.md,
    borderTopWidth: theme.borderWidth.hairline,
    borderTopColor: theme.border.default,
  },
  label: { flex: 1 },
  pressed: { backgroundColor: theme.surface.active },
}))
