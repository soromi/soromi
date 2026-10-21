import { TextInput } from 'react-native'

//Config
import { useTheme, useThemedStyles } from '@/config/theme'

//Styles
import { makeStyles } from './styles'

//Type
import type { Props } from './types'

/** A text box in the app's look. Everything a `TextInput` takes is passed on. */
export const Input = ({ mono = false, bare = false, ...props }: Props) => {
  const theme = useTheme()
  const styles = useThemedStyles(makeStyles)

  return (
    <TextInput
      placeholderTextColor={theme.text.muted}
      keyboardAppearance={theme.scheme}
      {...props}
      style={[
        styles.base,
        mono && styles.mono,
        bare && styles.bare,
        props.editable === false && styles.disabled,
        props.style,
      ]}
    />
  )
}
