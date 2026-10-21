import { expect, test } from 'vitest'

import {
  getParentPath,
  getShellAfter,
  isWithin,
  newShellId,
  withoutPaths,
} from './workspace.state.helpers'

//Type
import type { ShellSummary } from '@soromi/protocol'

const shell = (id: string, title = id): ShellSummary => ({ id, folder: '', title })

test('closing a terminal puts the next one on screen, or the one before the last', () => {
  const shells = [shell('a'), shell('b'), shell('c')]

  expect(getShellAfter(shells, 'a')).toBe('b')
  expect(getShellAfter(shells, 'c')).toBe('b')
  expect(getShellAfter([shell('a')], 'a')).toBeUndefined()
})

test('a terminal id is the kind the daemon takes for a shell, and never the same twice', () => {
  const id = newShellId()

  expect(id).toMatch(/^shell:[0-9a-f]{32}$/)
  expect(newShellId()).not.toBe(id)
})

test('a trashed path takes what is inside it along, and nothing that only shares its name', () => {
  const tree = { '': 1, src: 2, 'src/app': 3, 'src/app/main.ts': 4, 'src/apps': 5 }

  expect(withoutPaths(tree, (path) => isWithin(path, 'src/app'))).toEqual({
    '': 1,
    src: 2,
    'src/apps': 5,
  })
})

test('the folder a path is in, up to the root', () => {
  expect(getParentPath('src/app/main.ts')).toBe('src/app')
  expect(getParentPath('README.md')).toBe('')
})
