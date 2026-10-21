import { Text as RNText } from 'react-native'

//Config
import { useThemedStyles } from '@/config/theme'

//Styles
import { makeStyles, makeTones } from './styles'

//Type
import type { Props } from './types'

/** All text in the app: one of the theme's type styles, in one of its text colours. */
export const Text = ({ variant = 'body', tone = 'heading', ...props }: Props) => {
  const styles = useThemedStyles(makeStyles)
  const tones = useThemedStyles(makeTones)

  return <RNText {...props} style={[styles.base, styles[variant], tones[tone], props.style]} />
}
