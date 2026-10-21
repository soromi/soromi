import { View } from 'react-native'

//Components
import { Text } from '@/components'

//Config
import { defineStyles, useThemedStyles } from '@/config/theme'

//Constants
import { SESSIONS } from '../constants/sessions'

//Type
import type { PlaceholderProps } from '../types'

/** Beside the sessions column while no session is open: what to do, or why there is nothing to. */
export const SessionPlaceholder = (props: PlaceholderProps) => {
  const styles = useThemedStyles(makeStyles)

  return (
    <View style={styles.root}>
      <Text variant="bodySm" tone="muted" style={styles.message}>
        {props.online ? SESSIONS.empty.pick : SESSIONS.empty.offline}
      </Text>
    </View>
  )
}

const makeStyles = defineStyles((theme) => ({
  root: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: theme.spacing.xl },
  message: { textAlign: 'center' },
}))
