import { expect, test } from 'vitest'

import { toPreferences, toRoutes, toShells } from './keychain.helpers'

test('the routes kept are read back as they were saved', () => {
  const routes = ['ws://192.168.1.20:8318', 'ws://100.64.0.5:8318']

  expect(toRoutes(JSON.stringify(routes))).toEqual(routes)
})

test('anything else in their place counts as no routes', () => {
  expect(toRoutes(null)).toEqual([])
  expect(toRoutes('')).toEqual([])
  expect(toRoutes('not json')).toEqual([])
  expect(toRoutes('{"routes":[]}')).toEqual([])
  expect(toRoutes('["ws://a:1", 7, "", null]')).toEqual(['ws://a:1'])
})

test('the terminals kept are read back as they were saved', () => {
  const lists = { kazomi: [{ id: 'shell:1', folder: '', title: 'root' }] }

  expect(toShells(JSON.stringify(lists))).toEqual(lists)
})

test('anything else in their place counts as no terminals', () => {
  expect(toShells(null)).toEqual({})
  expect(toShells('not json')).toEqual({})
  expect(toShells('[]')).toEqual({})
  // A terminal that cannot be attached to is dropped, and a workspace left with none goes too.
  const stored = {
    one: [{ id: 'shell:1', folder: '', title: 'root' }, { id: 7 }],
    two: [{}],
    three: 3,
  }
  expect(toShells(JSON.stringify(stored))).toEqual({
    one: [{ id: 'shell:1', folder: '', title: 'root' }],
  })
})

test('the preferences kept are read back, and anything else is as the app starts out', () => {
  expect(toPreferences(JSON.stringify({ home: { view: 'grid' } }))).toEqual({
    home: { view: 'grid' },
  })
  expect(toPreferences(null)).toEqual({ home: { view: 'list' } })
  expect(toPreferences('not json')).toEqual({ home: { view: 'list' } })
  expect(toPreferences('null')).toEqual({ home: { view: 'list' } })
  expect(toPreferences(JSON.stringify({ home: { view: 'tiles' } }))).toEqual({
    home: { view: 'list' },
  })
})
