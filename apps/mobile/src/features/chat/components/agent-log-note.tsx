import { View } from 'react-native'

//Components
import { Text } from '@/components'

//Config
import { defineStyles, useThemedStyles } from '@/config/theme'

//Constants
import { CHAT } from '../constants/chat'

//Type
import type { AgentLogNoteProps } from '../types'

/** In place of an agent's log while there is none to show: being looked for, or not written. */
export const AgentLogNote = (props: AgentLogNoteProps) => {
  const styles = useThemedStyles(makeStyles)
  const copy = CHAT.agents.log
  const text = !props.loaded ? copy.loading : props.running ? copy.starting : copy.none

  return (
    <View style={styles.root}>
      <Text variant="bodySm" tone="muted" style={styles.text}>
        {text}
      </Text>
    </View>
  )
}

const makeStyles = defineStyles((theme) => ({
  root: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: theme.spacing.xl },
  text: { textAlign: 'center' },
}))
