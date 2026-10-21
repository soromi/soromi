import { expect, test } from 'vitest'

import { getShellAfter, getShellTitle, newShellId } from './workspace.state.helpers'

//Type
import type { Shell } from './workspace.state.type'

const shell = (id: string, title = id): Shell => ({ id, folder: '', title })

test('a terminal is named for the folder it starts in, or for the root', () => {
  expect(getShellTitle('', 'root', [])).toBe('root')
  expect(getShellTitle('apps/mobile', 'root', [])).toBe('mobile')
})

test('a name already taken in the workspace is numbered', () => {
  const peers = [shell('a', 'root'), shell('b', 'root 2')]

  expect(getShellTitle('', 'root', peers)).toBe('root 3')
  // A number freed by closing one is used again.
  expect(getShellTitle('', 'root', [shell('b', 'root 2')])).toBe('root')
})

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
