import { expect, test } from 'vitest'

import { getLanguage, getPathLanguage, highlightLines, joinLines } from './helpers'

//Type
import type { HighlightLine } from './types'

const scopes = (line: HighlightLine) =>
  line.filter((token) => token.text.trim()).map((token) => [token.text.trim(), token.scope])

test('a code block is coloured by the language it names, by any of its usual names', () => {
  expect(getLanguage('ts')).toBe('ts')
  expect(getLanguage(' Python ')).toBe('python')
  expect(getLanguage('rs')).toBe('rs')
  expect(getLanguage('no-such-language')).toBeNull()
  expect(getLanguage(null)).toBeNull()
})

test('a file is known by its extension, or by its whole name', () => {
  expect(getPathLanguage('src/main.rs')).toBe('rs')
  expect(getPathLanguage('apps/mobile/app.tsx')).toBe('tsx')
  expect(getPathLanguage('Dockerfile')).toBe('dockerfile')
  expect(getPathLanguage('deploy/Makefile')).toBe('makefile')
  expect(getPathLanguage('LICENSE')).toBeNull()
  expect(getPathLanguage('.gitignore')).toBeNull()
})

test('keywords that steer the flow are told apart from the others', () => {
  const [line] = highlightLines('const a = await f(this)', 'ts') ?? []

  expect(scopes(line)).toEqual([
    ['const', 'keyword'],
    ['a =', 'plain'],
    ['await', 'control'],
    ['f', 'function'],
    ['(', 'plain'],
    ['this', 'keyword'],
    [')', 'plain'],
  ])
})

test('a comment over several lines stays a comment on each, and text is unescaped', () => {
  const lines = highlightLines('/* a <b>\n & c */\nx', 'js') ?? []

  expect(lines).toHaveLength(3)
  expect(lines[0]).toEqual([{ text: '/* a <b>', scope: 'comment' }])
  expect(lines[1]).toEqual([{ text: ' & c */', scope: 'comment' }])
  expect(lines[2]).toEqual([{ text: 'x', scope: 'plain' }])
})

test('what is spliced into a string is code again, and a class name is a type', () => {
  // biome-ignore lint/suspicious/noTemplateCurlyInString: JavaScript source, read as text.
  const [template] = highlightLines('`a ${b} c`', 'js') ?? []
  const [declaration] = highlightLines('class A extends B {}', 'ts') ?? []

  expect(template.map((token) => token.scope)).toEqual(['string', 'plain', 'string'])
  expect(scopes(declaration)).toContainEqual(['A', 'type'])
  expect(scopes(declaration)).toContainEqual(['B', 'type'])
})

test('an unknown language, or code too long to colour, is left plain', () => {
  expect(highlightLines('x', null)).toBeNull()
  expect(highlightLines('x'.repeat(300_000), 'js')).toBeNull()
})

test('a block drawn whole keeps its line breaks', () => {
  const lines = highlightLines('a\nb', 'plaintext') ?? []

  expect(
    joinLines(lines)
      .map((token) => token.text)
      .join(''),
  ).toBe('a\nb')
})
