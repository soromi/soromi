import { expect, test } from 'vitest'

import { canOpen, getColumnWidths, getMarker, parseMarkdown, toPlainText } from './helpers'

//Type
import type { BlockNode, InlineNode, TableNode } from './types'

/** A node tree with the keys dropped, to compare shapes. */
const bare = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map(bare)
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([name]) => name !== 'key')
        .map(([name, inner]) => [name, bare(inner)]),
    )
  }

  return value
}

const text = (value: string) => ({ kind: 'text', text: value })

test('prose keeps its marks and loses its line wrapping', () => {
  const blocks = parseMarkdown('Some **bold _both_** and `code` and ~~gone~~\nsame paragraph')

  expect(bare(blocks)).toEqual([
    {
      kind: 'paragraph',
      children: [
        text('Some '),
        { kind: 'strong', children: [text('bold '), { kind: 'em', children: [text('both')] }] },
        text(' and '),
        { kind: 'code', text: 'code' },
        text(' and '),
        { kind: 'del', children: [text('gone')] },
        text(' same paragraph'),
      ],
    },
  ])
})

test('character references read as the characters they stand for', () => {
  const [paragraph] = parseMarkdown('a &amp; b &lt;c&gt; &quot;d&quot;') as [BlockNode]

  expect(paragraph.kind === 'paragraph' && toPlainText(paragraph.children)).toBe('a & b <c> "d"')
})

test('hard breaks and <br> break the line; other html is shown as written', () => {
  const [paragraph] = parseMarkdown('one  \ntwo<br>three <kbd>x</kbd>') as [BlockNode]
  const kinds = paragraph.kind === 'paragraph' ? paragraph.children.map((node) => node.kind) : []

  expect(kinds.filter((kind) => kind === 'break')).toHaveLength(2)
  expect(paragraph.kind === 'paragraph' && toPlainText(paragraph.children)).toContain(
    '<kbd>x</kbd>',
  )
})

test('headings past the third level are drawn as the third', () => {
  const depths = parseMarkdown('# a\n\n## b\n\n### c\n\n##### d').map(
    (block) => block.kind === 'heading' && block.depth,
  )

  expect(depths).toEqual([1, 2, 3, 3])
})

test('lists keep their order, numbering, tasks and nesting', () => {
  const [bullets, numbered] = parseMarkdown(
    '- one\n- [x] done\n- [ ] todo\n  - nested\n\n3. third\n4. fourth',
  ) as [BlockNode, BlockNode]

  if (bullets.kind !== 'list' || numbered.kind !== 'list') throw new Error('expected two lists')
  expect(bullets.items.map((item) => item.checked)).toEqual([undefined, true, false])
  expect(bullets.items.map((item, index) => getMarker(item, false, 1, index))).toEqual([
    '•',
    '☑',
    '☐',
  ])
  // The nested list sits inside the item that holds it, after the item's own text.
  expect(bullets.items[2]?.children.map((block) => block.kind)).toEqual(['paragraph', 'list'])
  expect(numbered.ordered).toBe(true)
  expect(numbered.items.map((item, index) => getMarker(item, true, numbered.start, index))).toEqual(
    ['3.', '4.'],
  )
})

test('code blocks keep their text exactly, and name their language', () => {
  const [code, plain] = parseMarkdown(
    '```ts\nconst a = 1 &amp; 2\n  indented\n```\n\n```\nno language\n```',
  ) as [BlockNode, BlockNode]

  expect(bare(code)).toEqual({ kind: 'code', lang: 'ts', text: 'const a = 1 &amp; 2\n  indented' })
  expect(bare(plain)).toEqual({ kind: 'code', lang: null, text: 'no language' })
})

test('a reply that stops mid-syntax still reads', () => {
  // An open code fence, as while the code is still streaming in.
  expect(bare(parseMarkdown('Here:\n\n```ts\nconst a'))).toEqual([
    { kind: 'paragraph', children: [text('Here:')] },
    { kind: 'code', lang: 'ts', text: 'const a' },
  ])
  // An emphasis that has not closed yet is plain text, not a crash.
  const [open] = parseMarkdown('this is **not closed') as [BlockNode]
  expect(open.kind === 'paragraph' && toPlainText(open.children)).toBe('this is **not closed')
  expect(parseMarkdown('')).toEqual([])
})

test('quotes and rules', () => {
  expect(bare(parseMarkdown('> quoted\n> more\n\n---'))).toEqual([
    { kind: 'quote', children: [{ kind: 'paragraph', children: [text('quoted more')] }] },
    { kind: 'rule' },
  ])
})

test('links keep their address; a picture becomes a link to it', () => {
  const [paragraph] = parseMarkdown('[docs](https://soromi.dev) ![shot](https://x.dev/a.png)') as [
    BlockNode,
  ]
  const links =
    paragraph.kind === 'paragraph'
      ? paragraph.children.filter((node): node is Extract<InlineNode, { kind: 'link' }> => {
          return node.kind === 'link'
        })
      : []

  expect(links.map((link) => [link.href, toPlainText(link.children)])).toEqual([
    ['https://soromi.dev', 'docs'],
    ['https://x.dev/a.png', 'shot'],
  ])
})

test('only web and mail addresses are opened', () => {
  expect(canOpen('https://soromi.dev')).toBe(true)
  expect(canOpen('HTTP://soromi.dev')).toBe(true)
  expect(canOpen('mailto:a@b.c')).toBe(true)
  expect(canOpen('javascript:alert(1)')).toBe(false)
  expect(canOpen('file:///etc/passwd')).toBe(false)
  expect(canOpen('soromi://pair#x')).toBe(false)
})

test('a table keeps its cells and alignment, and its columns fit their longest text', () => {
  const [table] = parseMarkdown(
    '| name | count |\n|---|:-:|\n| a | **2** |\n| a much longer name that goes on and on and on | 3 |',
  ) as [TableNode]

  expect(table.kind).toBe('table')
  expect(table.align).toEqual(['left', 'center'])
  expect(table.header.map(toPlainText)).toEqual(['name', 'count'])
  expect(table.rows.map((row) => row.map(toPlainText))).toEqual([
    ['a', '2'],
    ['a much longer name that goes on and on and on', '3'],
  ])
  // The long column is capped; the short one gets at least the minimum.
  expect(getColumnWidths(table)).toEqual([240, 64])
})

test('every node has a key, and keys within a parent are distinct', () => {
  const keys = new Set<string>()
  const visit = (value: unknown) => {
    if (Array.isArray(value)) {
      for (const inner of value) visit(inner)
    } else if (value && typeof value === 'object') {
      const node = value as { key?: string }
      if (node.key !== undefined) {
        expect(keys.has(node.key)).toBe(false)
        keys.add(node.key)
      }
      for (const inner of Object.values(value)) visit(inner)
    }
  }
  visit(parseMarkdown('# t\n\n- a **b** `c`\n  - d\n\n| x | y |\n|---|---|\n| 1 | 2 |\n\n> q'))

  expect(keys.size).toBeGreaterThan(10)
})
