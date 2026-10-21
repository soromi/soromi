import { Children, isValidElement } from 'react'
import { View } from 'react-native'

//Config
import { useThemedStyles } from '@/config/theme'

//Styles
import { makeStyles } from './styles'

//Type
import type { Props } from './types'

/** Rows that belong together, on one card, a hairline between each: a setting, a set of actions. */
export const Card = (props: Props) => {
  const styles = useThemedStyles(makeStyles)
  const rows = Children.toArray(props.children)

  return (
    <View style={styles.card}>
      {rows.map((row, index) => (
        <View key={isValidElement(row) ? row.key : index} style={index > 0 && styles.divided}>
          {row}
        </View>
      ))}
    </View>
  )
}
