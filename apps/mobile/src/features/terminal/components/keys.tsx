import { ScrollView } from 'react-native'

//Config
import { defineStyles, useThemedStyles } from '@/config/theme'

//Components
import { Key } from './key'

//Constants
import { TERMINAL } from '../constants/terminal'

//Type
import type { KeysProps } from '../types'

/**
 * The keys a phone's keyboard does not have and a terminal needs (escape, tab, interrupt, the
 * arrows), in a row under the terminal. They scroll sideways where the screen is narrow.
 */
export const Keys = (props: KeysProps) => {
  const styles = useThemedStyles(makeStyles)

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      keyboardShouldPersistTaps="always"
      style={styles.root}
      contentContainerStyle={styles.keys}
    >
      {TERMINAL.keys.map((item) => (
        <Key key={item.id} item={item} onSend={props.onSend} />
      ))}
    </ScrollView>
  )
}

const makeStyles = defineStyles((theme) => ({
  root: {
    flexGrow: 0,
    borderTopWidth: theme.borderWidth.hairline,
    borderTopColor: theme.border.default,
  },
  keys: {
    gap: theme.spacing.sm,
    paddingHorizontal: theme.spacing.sm2,
    paddingVertical: theme.spacing.sm,
  },
}))
