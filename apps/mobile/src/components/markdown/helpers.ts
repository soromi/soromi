import { lexer } from 'marked'

//Constants
import { MARKDOWN } from './constants'

//Type
import type { Token, Tokens } from 'marked'
import type { Align, BlockNode, HeadingDepth, InlineNode, ListItemNode, TableNode } from './types'

const ENTITIES: Record<string, string> = {
  '&amp;': '&',
  '&lt;': '<',
  '&gt;': '>',
  '&quot;': '"',
  '&#39;': "'",
  '&nbsp;': ' ',
}

/** Turns the few character references that show up in prose back into their characters. */
const decode = (text: string): string =>
  text.replace(/&(?:amp|lt|gt|quot|#39|nbsp);/g, (entity) => ENTITIES[entity] ?? entity)

/** Prose as it reads on screen: a line break in the source is a space, not a new line. */
const prose = (text: string): string => decode(text).replace(/\n/g, ' ')

const toInlines = (tokens: Token[] | undefined, path: string): InlineNode[] => {
  const nodes: InlineNode[] = []
  for (const [index, token] of (tokens ?? []).entries()) {
    const key = `${path}.${index}`
    switch (token.type) {
      case 'text': {
        const text = token as Tokens.Text
        if (text.tokens?.length) nodes.push(...toInlines(text.tokens, key))
        else nodes.push({ key, kind: 'text', text: prose(text.text) })
        break
      }
      case 'escape':
        nodes.push({ key, kind: 'text', text: decode((token as Tokens.Escape).text) })
        break
      case 'strong':
      case 'em':
      case 'del':
        nodes.push({ key, kind: token.type, children: toInlines(token.tokens, key) })
        break
      case 'codespan':
        nodes.push({ key, kind: 'code', text: decode((token as Tokens.Codespan).text) })
        break
      case 'link': {
        const link = token as Tokens.Link
        nodes.push({ key, kind: 'link', href: link.href, children: toInlines(link.tokens, key) })
        break
      }
      // A picture is not fetched: its description stands in for it, linked to where it lives.
      case 'image': {
        const image = token as Tokens.Image
        const label: InlineNode = { key: `${key}.0`, kind: 'text', text: image.text || image.href }
        nodes.push({ key, kind: 'link', href: image.href, children: [label] })
        break
      }
      case 'br':
        nodes.push({ key, kind: 'break' })
        break
      // Raw HTML is not run. A line break is honoured; anything else is shown as written.
      case 'html': {
        const html = (token as Tokens.HTML).text
        if (/^<br\s*\/?>$/i.test(html.trim())) nodes.push({ key, kind: 'break' })
        else nodes.push({ key, kind: 'text', text: html })
        break
      }
      // A task item's box is drawn as the item's marker.
      case 'checkbox':
        break
      default:
        if (token.raw) nodes.push({ key, kind: 'text', text: prose(token.raw) })
    }
  }

  return nodes
}

const toAlign = (align: string | null): Align =>
  align === 'center' || align === 'right' ? align : 'left'

const toListItem = (item: Tokens.ListItem, key: string): ListItemNode => ({
  key,
  checked: item.task ? Boolean(item.checked) : undefined,
  children: toBlocks(item.tokens, key),
})

const toTable = (table: Tokens.Table, key: string): TableNode => ({
  key,
  kind: 'table',
  align: table.align.map(toAlign),
  header: table.header.map((cell, column) => toInlines(cell.tokens, `${key}.h${column}`)),
  rows: table.rows.map((row, line) =>
    row.map((cell, column) => toInlines(cell.tokens, `${key}.r${line}c${column}`)),
  ),
})

const toBlocks = (tokens: Token[], path: string): BlockNode[] => {
  const blocks: BlockNode[] = []
  for (const [index, token] of tokens.entries()) {
    const key = `${path}.${index}`
    switch (token.type) {
      case 'heading': {
        const heading = token as Tokens.Heading
        const depth = Math.min(heading.depth, 3) as HeadingDepth
        blocks.push({ key, kind: 'heading', depth, children: toInlines(heading.tokens, key) })
        break
      }
      case 'paragraph':
        blocks.push({ key, kind: 'paragraph', children: toInlines(token.tokens, key) })
        break
      // Loose text inside a list item reads as a paragraph of that item.
      case 'text': {
        const text = token as Tokens.Text
        const children = text.tokens?.length
          ? toInlines(text.tokens, key)
          : [{ key: `${key}.0`, kind: 'text' as const, text: prose(text.text) }]
        blocks.push({ key, kind: 'paragraph', children })
        break
      }
      case 'code': {
        const code = token as Tokens.Code
        blocks.push({ key, kind: 'code', text: code.text, lang: code.lang?.trim() || null })
        break
      }
      case 'blockquote':
        blocks.push({ key, kind: 'quote', children: toBlocks(token.tokens ?? [], key) })
        break
      case 'list': {
        const list = token as Tokens.List
        blocks.push({
          key,
          kind: 'list',
          ordered: list.ordered,
          start: typeof list.start === 'number' ? list.start : 1,
          items: list.items.map((item, at) => toListItem(item, `${key}.${at}`)),
        })
        break
      }
      case 'table':
        blocks.push(toTable(token as Tokens.Table, key))
        break
      case 'hr':
        blocks.push({ key, kind: 'rule' })
        break
      case 'html':
        blocks.push({
          key,
          kind: 'paragraph',
          children: [{ key: `${key}.0`, kind: 'text', text: (token as Tokens.HTML).text.trim() }],
        })
        break
      // Blank lines and link definitions draw nothing.
      case 'space':
      case 'def':
      case 'checkbox':
        break
      default:
        if (token.raw.trim()) {
          blocks.push({
            key,
            kind: 'paragraph',
            children: [{ key: `${key}.0`, kind: 'text', text: prose(token.raw) }],
          })
        }
    }
  }

  return blocks
}

/**
 * Reads markdown into the blocks the renderer draws. This is the only place the parser is used.
 * Text that stops mid-syntax (a reply still streaming in) parses as far as it goes: an open code
 * fence is a code block, an unfinished emphasis is plain text.
 */
export const parseMarkdown = (text: string): BlockNode[] => toBlocks(lexer(text), 'b')

/** What stands in front of a list item. */
export const getMarker = (
  item: ListItemNode,
  ordered: boolean,
  start: number,
  index: number,
): string => {
  if (item.checked !== undefined) {
    return item.checked ? MARKDOWN.markers.checked : MARKDOWN.markers.unchecked
  }

  return ordered ? `${start + index}.` : MARKDOWN.markers.bullet
}

/** The text of some inline nodes with the formatting dropped, for measuring. */
export const toPlainText = (nodes: InlineNode[]): string =>
  nodes
    .map((node) => {
      if (node.kind === 'text' || node.kind === 'code') return node.text
      if (node.kind === 'break') return ' '

      return toPlainText(node.children)
    })
    .join('')

/**
 * How wide to draw each column of a table, from the longest text in it. A table scrolls sideways,
 * so columns take the room their content wants, within limits, rather than share the screen.
 */
export const getColumnWidths = (table: TableNode): number[] =>
  table.header.map((cell, column) => {
    const longest = table.rows.reduce(
      (most, row) => Math.max(most, toPlainText(row[column] ?? []).length),
      toPlainText(cell).length,
    )
    const wanted = longest * MARKDOWN.column.perCharacter + MARKDOWN.column.padding

    return Math.min(Math.max(wanted, MARKDOWN.column.min), MARKDOWN.column.max)
  })

/** Whether a link's address is one the app will open. */
export const canOpen = (href: string): boolean =>
  MARKDOWN.schemes.some((scheme) => href.toLowerCase().startsWith(scheme))
