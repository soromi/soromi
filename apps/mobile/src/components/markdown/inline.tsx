import { useCallback } from 'react'
import { Linking, Text } from 'react-native'

//Config
import { useThemedStyles } from '@/config/theme'

//Helpers
import { canOpen } from './helpers'

//Styles
import { makeStyles } from './styles'

//Type
import type { InlineNode, InlinesProps, LinkProps } from './types'

/** A link in the text. Opens addresses the app allows; any other is shown but does nothing. */
export const InlineLink = (props: LinkProps) => {
  const styles = useThemedStyles(makeStyles)
  const href = props.href

  const handlePress = useCallback(() => {
    if (canOpen(href)) void Linking.openURL(href)
  }, [href])

  return (
    <Text accessibilityRole="link" style={styles.link} onPress={handlePress}>
      <Inlines nodes={props.children} />
    </Text>
  )
}

/** One mark or run of text. Nested inside its line's `Text`, it inherits the line's type style. */
export const Inline = (props: { node: InlineNode }) => {
  const styles = useThemedStyles(makeStyles)
  const node = props.node

  switch (node.kind) {
    case 'text':
      return node.text
    case 'break':
      return '\n'
    case 'code':
      return <Text style={styles.codespan}>{node.text}</Text>
    case 'link':
      return <InlineLink href={node.href}>{node.children}</InlineLink>
    default:
      return (
        <Text style={styles[node.kind]}>
          <Inlines nodes={node.children} />
        </Text>
      )
  }
}

/** A line's contents: text with its bold, italic, code and links. */
export const Inlines = (props: InlinesProps) =>
  props.nodes.map((node) => <Inline key={node.key} node={node} />)
