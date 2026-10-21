import { View } from 'react-native'

//Config
import { useThemedStyles } from '@/config/theme'

//Styles
import { makeStyles } from './styles'

//Type
import type { Props } from './types'

/** A session's status as a dot: working, waiting on the user, blocked, finished, or idle. */
export const StatusDot = (props: Props) => {
  const styles = useThemedStyles(makeStyles)

  return <View style={[styles.dot, styles[props.status]]} />
}
