import { expect, test } from 'vitest'

import {
  getChildPath,
  getSpareAccounts,
  isEdited,
  withAccount,
  withFolder,
  withoutAccount,
  withoutFolder,
} from './helpers'

test('a folder inside another is named from its parent, the top of the disk included', () => {
  expect(getChildPath('/Users/juan', 'code')).toBe('/Users/juan/code')
  expect(getChildPath('/Users/juan/', 'code')).toBe('/Users/juan/code')
  expect(getChildPath('/', 'Users')).toBe('/Users')
})

test('a folder is added once, whatever its trailing slash, and removed by its path', () => {
  const folders = ['/code/api']

  expect(withFolder(folders, '/code/web')).toEqual(['/code/api', '/code/web'])
  expect(withFolder(folders, '/code/api/')).toBe(folders)
  expect(withoutFolder(['/code/api', '/code/web'], '/code/api')).toEqual(['/code/web'])
})

test('an agent can be bound to the accounts that configure it, and always keeps one', () => {
  const profiles = [
    { name: 'work', providers: { claude: {} } },
    { name: 'home', providers: { claude: {}, codex: {} } },
  ]

  expect(getSpareAccounts(profiles, 'claude', ['work'])).toEqual(['home'])
  expect(getSpareAccounts(profiles, 'grok', [])).toEqual([])

  const bound = withAccount({ claude: ['personal'] }, 'claude', 'work')
  expect(bound).toEqual({ claude: ['personal', 'work'] })
  expect(withAccount(bound, 'claude', 'work')).toBe(bound)
  expect(withoutAccount(bound, 'claude', 'personal')).toEqual({ claude: ['work'] })
  expect(withoutAccount({ claude: ['work'] }, 'claude', 'work')).toEqual({ claude: ['personal'] })
})

test('a workspace’s settings are edited once anything differs from how they started', () => {
  const start = {
    name: 'Bookr',
    folders: ['/w/core', '/w/front'],
    bindings: { claude: ['bookr', 'Bookr2'], codex: ['bookr'] },
    instructions: '',
  }

  expect(isEdited(start, { ...start })).toBe(false)
  // Spaces around a name or the instructions are not a change.
  expect(isEdited(start, { ...start, name: ' Bookr ', instructions: '  ' })).toBe(false)
  expect(isEdited(start, { ...start, name: 'Bookr 2' })).toBe(true)
  expect(isEdited(start, { ...start, folders: ['/w/front', '/w/core'] })).toBe(true)
  // The default account is the first: swapping two is a change.
  expect(
    isEdited(start, { ...start, bindings: { ...start.bindings, claude: ['Bookr2', 'bookr'] } }),
  ).toBe(true)
  expect(isEdited(start, { ...start, bindings: { ...start.bindings, grok: ['personal'] } })).toBe(
    true,
  )
})
