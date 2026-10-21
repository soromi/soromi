import { View } from 'react-native'

//Components
import { Button, Sheet } from '@/components'

//Config
import { defineStyles, useThemedStyles } from '@/config/theme'

//Components
import { AgentUsageCard } from './agent'

//Constants
import { USAGE } from '../constants/usage'

//Helpers
import { getAgentKey } from '../helpers'

//Type
import type { UsageSheetProps } from '../types'

/**
 * A workspace's usage over the chat, from the line under its box: each agent's windows as bars,
 * when they reset, its plan page, and a way to have the computer read it afresh.
 */
export const UsageSheet = (props: UsageSheetProps) => {
  const styles = useThemedStyles(makeStyles)

  return (
    <Sheet visible={props.visible} title={USAGE.title} onClose={props.onClose}>
      {props.agents.map((one) => (
        <AgentUsageCard key={getAgentKey(one)} bare usage={one} now={props.now} />
      ))}
      <View style={styles.actions}>
        <Button
          label={props.refreshing ? USAGE.again.busy : USAGE.again.label}
          variant="secondary"
          size="sm"
          disabled={props.refreshing || !props.online}
          onPress={props.onRefresh}
        />
      </View>
    </Sheet>
  )
}

const makeStyles = defineStyles((theme) => ({
  actions: { paddingHorizontal: theme.spacing.md, paddingTop: theme.spacing.sm2 },
}))
