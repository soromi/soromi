import { usageFill, usageLevel, usageWindowLabel } from '@soromi/core'
import { useMemo } from 'react'
import { View } from 'react-native'

//Components
import { Text } from '@/components'

//Config
import { defineStyles, useThemedStyles } from '@/config/theme'

//Helpers
import { getResetText } from '../helpers'

//Type
import type { WindowBarProps } from '../types'

/**
 * One of an agent's usage windows (the five-hour session, the week): its name and percent, a bar
 * coloured by how full it is, and when it rolls over.
 */
export const UsageBar = (props: WindowBarProps) => {
  const styles = useThemedStyles(makeStyles)
  const percent = props.window.percent
  const level = usageLevel(percent)

  const fill = useMemo(
    () => [styles.fill, styles[level], { width: `${usageFill(percent) * 100}%` as const }],
    [styles, level, percent],
  )
  const reset = getResetText(props.window, props.now)

  return (
    <View style={styles.root}>
      <View style={styles.line}>
        <Text variant="bodySm" tone="body">
          {usageWindowLabel(props.window.label)}
        </Text>
        <Text variant="bodySemiBold" tone="heading">
          {`${Math.round(percent)}%`}
        </Text>
      </View>
      <View style={styles.track}>
        <View style={fill} />
      </View>
      {reset && (
        <Text variant="caption" tone="muted">
          {reset}
        </Text>
      )}
    </View>
  )
}

const makeStyles = defineStyles((theme) => ({
  root: { gap: theme.spacing.xs },
  line: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' },
  track: {
    height: 8,
    overflow: 'hidden',
    borderRadius: theme.borderRadius.round,
    backgroundColor: theme.usage.track,
  },
  fill: { height: '100%', borderRadius: theme.borderRadius.round },
  room: { backgroundColor: theme.usage.room },
  filling: { backgroundColor: theme.usage.filling },
  full: { backgroundColor: theme.usage.full },
}))
