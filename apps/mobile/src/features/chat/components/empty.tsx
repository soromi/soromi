//Components
import { Text } from '@/components'

//Config
import { defineStyles, useThemedStyles } from '@/config/theme'

//Constants
import { CHAT } from '../constants/chat'

//Type
import type { EmptyProps } from '../types'

/** In place of a conversation that has nothing in it yet. */
export const ChatEmpty = (props: EmptyProps) => {
  const styles = useThemedStyles(makeStyles)

  return (
    <Text variant="bodySm" tone="muted" style={styles.message}>
      {props.chat ? CHAT.empty.chat : CHAT.empty.terminal}
    </Text>
  )
}

const makeStyles = defineStyles((theme) => ({
  message: { padding: theme.spacing.xl, textAlign: 'center' },
}))
