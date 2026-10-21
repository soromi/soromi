import { expect, test } from 'vitest'

import { flattenTree, unlistedDirs } from './tree'

//Types
import type { DirEntry } from '@soromi/protocol'

const dir = (name: string, ignored = false): DirEntry => ({ name, type: 'dir', ignored })
const file = (name: string, ignored = false): DirEntry => ({ name, type: 'file', ignored })

test('nothing is known until the root has been listed', () => {
  expect(flattenTree({ listings: {}, expanded: {} })).toBeUndefined()
  expect(unlistedDirs({ listings: {}, expanded: {} })).toEqual([''])
})

test('an open, listed folder shows its children under it, one level in', () => {
  const rows = flattenTree({
    listings: {
      '': [dir('src'), file('README.md')],
      src: [dir('app'), file('index.ts'), file('.env', true)],
    },
    expanded: { src: true },
    selected: 'src/index.ts',
  })

  expect(rows?.map((row) => [row.path, row.depth])).toEqual([
    ['src', 0],
    ['src/app', 1],
    ['src/index.ts', 1],
    ['src/.env', 1],
    ['README.md', 0],
  ])
  expect(rows?.find((row) => row.path === 'src')?.expanded).toBe(true)
  expect(rows?.find((row) => row.path === 'src/app')?.expanded).toBe(false)
  expect(rows?.find((row) => row.path === 'src/index.ts')?.selected).toBe(true)
  expect(rows?.find((row) => row.path === 'src/.env')?.ignored).toBe(true)
})

test('an open folder that has not been listed shows as open, with nothing under it yet', () => {
  const state = { listings: { '': [dir('src')] }, expanded: { src: true, gone: false } }

  expect(flattenTree(state)?.map((row) => row.path)).toEqual(['src'])
  // That is what has to be fetched; a closed folder is not.
  expect(unlistedDirs(state)).toEqual(['src'])
})
