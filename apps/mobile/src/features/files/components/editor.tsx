//Components
import { Input } from '@/components'

//Config
import { defineStyles, useThemedStyles } from '@/config/theme'

//Type
import type { EditorProps } from '../types'

/** A file's text, to type in: monospace, and left exactly as written (no corrections, no capitals). */
export const Editor = (props: EditorProps) => {
  const styles = useThemedStyles(makeStyles)

  return (
    <Input
      mono
      bare
      multiline
      autoFocus
      autoCapitalize="none"
      autoCorrect={false}
      spellCheck={false}
      style={styles.box}
      value={props.value}
      onChangeText={props.onChange}
    />
  )
}

const makeStyles = defineStyles((theme) => ({
  box: { flex: 1, padding: theme.spacing.sm2, color: theme.text.body },
}))
