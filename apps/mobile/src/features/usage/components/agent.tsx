import { usageAgentName, usageManageUrl } from '@soromi/core'
import { View } from 'react-native'

//Components
import { ProviderMark, Text } from '@/components'

//Config
import { defineStyles, useThemedStyles } from '@/config/theme'

//Components
import { ManagePlan } from './manage'
import { UsageBar } from './window'

//Helpers
import { getPlanLabel } from '../helpers'

//Type
import type { AgentCardProps } from '../types'

/**
 * One agent's usage, on a card: its mark, name and plan, each of its windows as a bar, and its
 * plan page. An account the computer could not read usage for says why, in place of the bars.
 */
export const AgentUsageCard = (props: AgentCardProps) => {
  const styles = useThemedStyles(makeStyles)
  const usage = props.usage
  const url = usageManageUrl(usage.agent)

  return (
    <View style={!props.bare && styles.card}>
      <View style={[styles.body, props.bare && styles.flush]}>
        <View style={styles.heading}>
          <ProviderMark provider={usage.agent} size={18} />
          <Text variant="bodySemiBold" tone="heading" style={styles.name}>
            {usageAgentName(usage.agent)}
          </Text>
          {usage.plan && (
            <Text variant="captionSemiBold" tone="muted">
              {getPlanLabel(usage.plan)}
            </Text>
          )}
        </View>
        {usage.note && (
          <Text variant="bodySm" tone="body">
            {usage.note}
          </Text>
        )}
        {usage.windows.map((window) => (
          <UsageBar key={window.label} window={window} now={props.now} />
        ))}
      </View>
      {url && <ManagePlan agent={usage.agent} url={url} />}
    </View>
  )
}

const makeStyles = defineStyles((theme) => ({
  card: {
    overflow: 'hidden',
    borderRadius: theme.borderRadius.lg,
    backgroundColor: theme.surface.raised,
  },
  body: { gap: theme.spacing.md, padding: theme.spacing.md },
  // On a sheet the rows above and below already sit at its edge.
  flush: { paddingTop: theme.spacing.sm },
  heading: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm2 },
  name: { flex: 1 },
}))
