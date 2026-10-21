import { expect, test } from 'vitest'

import {
  getAbsolutePath,
  getFileStatus,
  isEditable,
  getChevron,
  getFileHref,
  getFileIcon,
  getFileName,
  isMarkdown,
  toLines,
} from './helpers'

//Type
import type { FileNode } from '@soromi/core'

const node = (type: 'file' | 'dir', expanded?: boolean): FileNode => ({
  path: 'src',
  name: 'src',
  type,
  ignored: false,
  depth: 0,
  expanded,
})

test('a folder shows whether it is open by the way its arrow points', () => {
  expect(getChevron(node('dir', true))).toBe('chevron-down')
  expect(getChevron(node('dir', false))).toBe('chevron-right')
  expect(getChevron(node('dir'))).toBe('chevron-right')
})

test('a file is drawn by its type, in that type’s colour', () => {
  expect(getFileIcon('index.ts').icon).toBe('code')
  expect(getFileIcon('README.md').icon).toBe('file-text')
  expect(getFileIcon('pnpm-lock.yaml').icon).toBe('lock')
  expect(getFileIcon('.npmrc').icon).toBe('file')
  expect(getFileIcon('index.ts').color).not.toBe(getFileIcon('biome.json').color)
})

test('a file is named by its last part, and opened by its whole path', () => {
  expect(getFileName('src/app/index.tsx')).toBe('index.tsx')
  expect(getFileName('README.md')).toBe('README.md')
  expect(getFileHref('ws', 'src/[id].tsx')).toEqual({
    pathname: '/workspace/[name]/file',
    params: { name: 'ws', path: 'src/[id].tsx' },
  })
})

test('markdown files are told from source by their extension', () => {
  expect(['README.md', 'docs/guide.MDX', 'a.markdown'].map(isMarkdown)).toEqual([true, true, true])
  // A dotfile named after the extension is not a document, nor is a folder-looking name.
  expect(['.md', 'md', 'notes.txt', 'src/md/index.ts'].map(isMarkdown)).toEqual([
    false,
    false,
    false,
    false,
  ])
})

test('a file is numbered line by line, blank lines included', () => {
  expect(toLines('a\n\nc').map((line) => [line.number, line.text])).toEqual([
    [1, 'a'],
    [2, ''],
    [3, 'c'],
  ])
  expect(toLines('')).toHaveLength(1)
})

test('a path on the computer is the workspace folder followed by the path within it', () => {
  expect(getAbsolutePath('/Users/me/app', 'src/index.ts')).toBe('/Users/me/app/src/index.ts')
  expect(getAbsolutePath('/Users/me/app/', 'src')).toBe('/Users/me/app/src')
  expect(getAbsolutePath('/', 'etc')).toBe('/etc')
  // The folder is not known yet: the path within the workspace is all there is.
  expect(getAbsolutePath(undefined, 'src/index.ts')).toBe('src/index.ts')
})

const text = (content: string) => ({ content, truncated: false, binary: false })

test('a file can be edited when all of it is here and it is not too long', () => {
  expect(isEditable(text('hello'))).toBe(true)
  expect(isEditable({ content: 'start', truncated: true, binary: false })).toBe(false)
  expect(isEditable({ content: '', truncated: false, binary: true })).toBe(false)
  expect(isEditable(text('x'.repeat(200_001)))).toBe(false)
})

test('the toolbar says where a save stands, or why the file cannot be edited', () => {
  const file = text('hello')
  const base = { file, save: undefined, dirty: false, online: true }

  expect(getFileStatus(base)).toBeNull()
  expect(getFileStatus({ ...base, dirty: true })).toBe('unsaved')
  expect(getFileStatus({ ...base, dirty: true, save: { state: 'saving', content: 'x' } })).toBe(
    'saving',
  )
  // A failed save stays in view until the draft is saved or dropped.
  expect(getFileStatus({ ...base, dirty: true, save: { state: 'failed', content: 'x' } })).toBe(
    'failed',
  )
  expect(getFileStatus({ ...base, save: { state: 'saved', content: 'hello' } })).toBe('saved')
  expect(getFileStatus({ ...base, online: false })).toBe('offline')
  expect(getFileStatus({ ...base, file: text('x'.repeat(200_001)) })).toBe('large')
})
