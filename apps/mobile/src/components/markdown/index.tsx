import { useMemo } from 'react'
import { View } from 'react-native'

//Config
import { useThemedStyles } from '@/config/theme'

//Components
import { Blocks } from './block'

//Helpers
import { parseMarkdown } from './helpers'

//Styles
import { makeStyles } from './styles'

//Type
import type { Props } from './types'

/**
 * A message written in markdown, drawn in the app's look: headings, emphasis, links, lists (with
 * tasks), quotes, code blocks and tables. The text is parsed once per change, so a reply streaming
 * in is re-read as it grows and a settled message is not.
 *
 * Code is not syntax-highlighted, pictures are shown as a link to them, and raw HTML is shown as
 * written.
 */
export const Markdown = (props: Props) => {
  const styles = useThemedStyles(makeStyles)
  const text = props.text

  const blocks = useMemo(() => parseMarkdown(text), [text])

  return (
    <View style={styles.root}>
      <Blocks blocks={blocks} />
    </View>
  )
}
