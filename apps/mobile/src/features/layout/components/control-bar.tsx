import { useCallback } from 'react'
import { View } from 'react-native'

//Components
import { Button, Text } from '@/components'

//Config
import { defineStyles, useThemedStyles } from '@/config/theme'

//Constants
import { CONTROL } from '../constants/control'

//Services
import { LinkService } from '@/services/link'

//State
import { useDaemonControlHolder } from '@/states/daemon/daemon.state.hook'

/**
 * Shown while another device drives the sessions. Only one does at a time; this one keeps
 * watching, and can take over from here. Renders nothing when this phone is in control.
 */
export const ControlBar = () => {
  const styles = useThemedStyles(makeStyles)
  const holder = useDaemonControlHolder()

  const handleTakeOver = useCallback(() => LinkService.send({ type: 'take-control' }), [])

  if (holder === null) return null

  return (
    <View style={styles.bar}>
      <View style={styles.dot} />
      <Text variant="caption" tone="muted" numberOfLines={2} style={styles.message}>
        {CONTROL.lead}
        <Text variant="captionSemiBold">{holder}</Text>
        {CONTROL.trail}
      </Text>
      <Button size="sm" variant="warn" label={CONTROL.takeOver} onPress={handleTakeOver} />
    </View>
  )
}

const makeStyles = defineStyles((theme) => ({
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm2,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
    backgroundColor: theme.surface.raised,
    borderBottomWidth: theme.borderWidth.hairline,
    borderBottomColor: theme.border.default,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: theme.borderRadius.round,
    backgroundColor: theme.surface.warn,
  },
  message: { flex: 1 },
}))
