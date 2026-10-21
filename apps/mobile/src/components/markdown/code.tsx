import { ScrollView, Text, View } from 'react-native'

//Config
import { useThemedStyles } from '@/config/theme'

//Styles
import { makeStyles } from './styles'

//Type
import type { CodeProps } from './types'

/**
 * A block of code: monospace, as written, with its language named when the message gave one. Long
 * lines scroll sideways instead of wrapping, so the code keeps its shape.
 */
export const CodeBlock = (props: CodeProps) => {
  const styles = useThemedStyles(makeStyles)

  return (
    <View style={styles.code}>
      {props.lang && <Text style={styles.codeLang}>{props.lang}</Text>}
      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        <View style={styles.codeScroll}>
          <Text selectable style={styles.codeText}>
            {props.text}
          </Text>
        </View>
      </ScrollView>
    </View>
  )
}
