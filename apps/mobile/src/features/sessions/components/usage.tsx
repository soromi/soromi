import { usageGlance, usageLevel } from '@soromi/core'
import { useRouter } from 'expo-router'
import { useCallback, useMemo } from 'react'
import { View } from 'react-native'

//Components
import { ActionRow, ProviderMark, Text } from '@/components'

//Config
import { defineStyles, useThemedStyles } from '@/config/theme'

//Constants
import { SESSIONS } from '../constants/sessions'

//Helpers
import { getUsageHref, getUsageLabel } from '../helpers'

//Type
import type { UsageProps } from '../types'

/**
 * One of a workspace's actions: how much of their plans its agents have used, each by its mark
 * and the percent of its session window. A tap shows all of it.
 */
export const WorkspaceUsage = (props: UsageProps) => {
  const styles = useThemedStyles(makeStyles)
  const router = useRouter()
  const workspace = props.workspace
  const agents = props.agents

  const glance = useMemo(() => usageGlance(agents), [agents])

  const handlePress = useCallback(() => router.push(getUsageHref(workspace)), [router, workspace])

  const stats = useMemo(
    () => (
      <View style={styles.stats}>
        {glance.map((one) => (
          <View key={one.agent} style={styles.stat}>
            <ProviderMark provider={one.agent} size={13} />
            <Text variant="bodySmSemiBold" tone={SESSIONS.usage.tones[usageLevel(one.percent)]}>
              {`${one.percent}%`}
            </Text>
          </View>
        ))}
      </View>
    ),
    [styles, glance],
  )

  return (
    <ActionRow
      icon="chart"
      tone="body"
      label={SESSIONS.usage.label}
      accessibilityLabel={getUsageLabel(agents)}
      hint={SESSIONS.usage.hint}
      trailing={stats}
      chevron
      onPress={handlePress}
    />
  )
}

const makeStyles = defineStyles((theme) => ({
  stats: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm2 },
  stat: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing.xs },
}))
