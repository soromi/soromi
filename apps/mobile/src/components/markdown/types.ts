/** A piece of text inside a block. Each node carries a key that is stable for the same text. */
export type InlineNode =
  | { key: string; kind: 'text'; text: string }
  | { key: string; kind: 'strong' | 'em' | 'del'; children: InlineNode[] }
  | { key: string; kind: 'code'; text: string }
  | { key: string; kind: 'link'; href: string; children: InlineNode[] }
  | { key: string; kind: 'break' }

export type HeadingDepth = 1 | 2 | 3

export type Align = 'left' | 'center' | 'right'

export type ListItemNode = {
  key: string
  /** A task item's state; `undefined` for an ordinary item. */
  checked?: boolean
  children: BlockNode[]
}

export type TableNode = {
  key: string
  kind: 'table'
  align: Align[]
  header: InlineNode[][]
  rows: InlineNode[][][]
}

export type BlockNode =
  | { key: string; kind: 'paragraph'; children: InlineNode[] }
  | { key: string; kind: 'heading'; depth: HeadingDepth; children: InlineNode[] }
  | { key: string; kind: 'code'; text: string; lang: string | null }
  | { key: string; kind: 'quote'; children: BlockNode[] }
  | { key: string; kind: 'list'; ordered: boolean; start: number; items: ListItemNode[] }
  | { key: string; kind: 'rule' }
  | TableNode

export type Props = {
  /** A message as markdown. It may stop mid-syntax while it is still streaming in. */
  text: string
}

export type BlocksProps = {
  blocks: BlockNode[]
}

export type BlockProps = {
  block: BlockNode
}

export type InlinesProps = {
  nodes: InlineNode[]
}

export type LinkProps = {
  href: string
  children: InlineNode[]
}

export type ListRowProps = {
  item: ListItemNode
  /** What stands in front of the item: a bullet, its number, or a task's box. */
  marker: string
}

export type CodeProps = {
  text: string
  lang: string | null
}

export type TableProps = {
  table: TableNode
}

export type TableRowProps = {
  cells: InlineNode[][]
  widths: number[]
  align: Align[]
  header: boolean
}

export type TableCellProps = {
  nodes: InlineNode[]
  width: number
  align: Align
  header: boolean
}

export type MarkdownConfig = {
  markers: {
    bullet: string
    checked: string
    unchecked: string
  }
  /** The address schemes a link is allowed to open. */
  schemes: string[]
  /** A table column's width, from the longest text in it. */
  column: {
    perCharacter: number
    padding: number
    min: number
    max: number
  }
}
