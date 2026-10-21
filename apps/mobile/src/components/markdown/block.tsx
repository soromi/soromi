import { Text, View } from 'react-native'

//Config
import { useThemedStyles } from '@/config/theme'

//Components
import { CodeBlock } from './code'
import { Inlines } from './inline'
import { Table } from './table'

//Helpers
import { getMarker } from './helpers'

//Styles
import { makeStyles } from './styles'

//Type
import type { BlockProps, BlocksProps, ListRowProps } from './types'

/** One item of a list: its marker, then whatever the item holds (text, a nested list, code). */
const ListRow = (props: ListRowProps) => {
  const styles = useThemedStyles(makeStyles)

  return (
    <View style={styles.item}>
      <Text style={styles.marker}>{props.marker}</Text>
      <View style={styles.itemBody}>
        <Blocks blocks={props.item.children} />
      </View>
    </View>
  )
}

/** One block of a message: a paragraph, a heading, a list, a quote, code, a table or a rule. */
export const Block = (props: BlockProps) => {
  const styles = useThemedStyles(makeStyles)
  const block = props.block

  switch (block.kind) {
    case 'paragraph':
      return (
        <Text selectable style={styles.paragraph}>
          <Inlines nodes={block.children} />
        </Text>
      )
    case 'heading':
      return (
        <Text selectable accessibilityRole="header" style={styles[`heading${block.depth}`]}>
          <Inlines nodes={block.children} />
        </Text>
      )
    case 'code':
      return <CodeBlock text={block.text} lang={block.lang} />
    case 'quote':
      return (
        <View style={styles.quote}>
          <Blocks blocks={block.children} />
        </View>
      )
    case 'list':
      return (
        <View style={styles.list}>
          {block.items.map((item, index) => (
            <ListRow
              key={item.key}
              item={item}
              marker={getMarker(item, block.ordered, block.start, index)}
            />
          ))}
        </View>
      )
    case 'table':
      return <Table table={block} />
    case 'rule':
      return <View style={styles.rule} />
    default:
      return null
  }
}

/** A run of blocks, one under the other. */
export const Blocks = (props: BlocksProps) =>
  props.blocks.map((block) => <Block key={block.key} block={block} />)
