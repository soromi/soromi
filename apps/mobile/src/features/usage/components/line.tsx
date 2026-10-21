import { usageGlance, usageLevel, usageResets, usageSoonestReset } from '@soromi/core'
import { useCallback, useMemo, useState } from 'react'
import { Pressable, View } from 'react-native'

//Components
import { Icon, ProviderMark, Text } from '@/components'

//Config
import { defineStyles, useThemedStyles } from '@/config/theme'

//Components
import { UsageSheet } from './sheet'

//Constants
import { USAGE } from '../constants/usage'

//Helpers
import { getLineLabel } from '../helpers'

//Hooks
import { useClock } from '@/hooks/use-clock'
import { useUsage } from '@/hooks/use-usage'

//State
import { useLinkOnline } from '@/states/link/link.state.hook'

//Type
import type { PressableStateCallbackType } from 'react-native'
import type { UsageLineProps } from '../types'

/**
 * Under a chat's box, as the desktop's status bar has it: the workspace's usage in a line, each
 * agent by its mark and the percent of its session window, and when the first window resets. A
 * tap brings up all of it on a sheet, over the chat. Not there until a reading has something in
 * it.
 */
export const UsageLine = (props: UsageLineProps) => {
  const styles = useThemedStyles(makeStyles)
  const usage = useUsage(props.workspace)
  const online = useLinkOnline()
  const now = useClock()
  const [open, setOpen] = useState(false)
  const agents = usage.agents

  const glance = useMemo(() => usageGlance(agents ?? []), [agents])
  const soonest = useMemo(() => usageSoonestReset(agents ?? []), [agents])

  const handleOpen = useCallback(() => setOpen(true), [])
  const handleClose = useCallback(() => setOpen(false), [])

  const getStyle = useCallback(
    (state: PressableStateCallbackType) => [styles.row, state.pressed && styles.pressed],
    [styles],
  )

  if (!agents?.length) return null

  return (
    <>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={getLineLabel(agents)}
        accessibilityHint={USAGE.line.hint}
        style={getStyle}
        onPress={handleOpen}
      >
        <Icon name="chart" size={13} />
        <Text variant="caption" tone="muted">
          {USAGE.title}
        </Text>
        {glance.map((one) => (
          <View key={one.agent} style={styles.stat}>
            <ProviderMark provider={one.agent} size={11} />
            <Text variant="captionSemiBold" tone={USAGE.tones[usageLevel(one.percent)]}>
              {`${one.percent}%`}
            </Text>
          </View>
        ))}
        <View style={styles.spacer} />
        {soonest !== null && (
          <Text variant="caption" tone="muted" numberOfLines={1}>
            {usageResets(soonest, now)}
          </Text>
        )}
        <Icon name="chevron-up" size={13} />
      </Pressable>
      <UsageSheet
        visible={open}
        agents={agents}
        now={now}
        refreshing={usage.refreshing}
        online={online}
        onRefresh={usage.refresh}
        onClose={handleClose}
      />
    </>
  )
}

const makeStyles = defineStyles((theme) => ({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
    paddingHorizontal: theme.spacing.sm,
    paddingTop: theme.spacing.sm,
    paddingBottom: theme.spacing.xs,
    borderRadius: theme.borderRadius.sm,
  },
  stat: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing.xs },
  spacer: { flex: 1 },
  pressed: { backgroundColor: theme.surface.raised },
}))
