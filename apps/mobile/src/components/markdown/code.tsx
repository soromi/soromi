import { useMemo } from 'react'
import { ScrollView, Text, View } from 'react-native'

//Components
import { Highlight } from '../highlight'

//Config
import { useThemedStyles } from '@/config/theme'

//Helpers
import { getLanguage, highlightLines, joinLines } from '../highlight/helpers'

//Styles
import { makeStyles } from './styles'

//Type
import type { CodeProps } from './types'

/**
 * A block of code: monospace, as written, with its language named when the message gave one, and
 * coloured in that language as the desktop's chat colours it. Long lines scroll sideways instead
 * of wrapping, so the code keeps its shape.
 */
export const CodeBlock = (props: CodeProps) => {
  const styles = useThemedStyles(makeStyles)
  const text = props.text
  const lang = props.lang

  const tokens = useMemo(() => {
    const lines = highlightLines(text, getLanguage(lang))

    return lines ? joinLines(lines) : null
  }, [text, lang])

  return (
    <View style={styles.code}>
      {props.lang && <Text style={styles.codeLang}>{props.lang}</Text>}
      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        <View style={styles.codeScroll}>
          <Text selectable style={styles.codeText}>
            {tokens ? <Highlight tokens={tokens} palette="message" /> : text}
          </Text>
        </View>
      </ScrollView>
    </View>
  )
}
