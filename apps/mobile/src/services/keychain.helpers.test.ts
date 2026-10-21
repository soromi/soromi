import { expect, test } from 'vitest'

import {
  getActiveComputer,
  toComputers,
  toPreferences,
  toRoutes,
  withComputer,
} from './keychain.helpers'

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

test('the preferences kept are read back, and anything else is as the app starts out', () => {
  const none = { sidebar: null, panel: null }
  const start = { home: { view: 'list' }, columns: none, appearance: 'system' }
  expect(toPreferences(JSON.stringify({ home: { view: 'grid' } }))).toEqual({
    ...start,
    home: { view: 'grid' },
  })
  expect(toPreferences(null)).toEqual(start)
  expect(toPreferences('not json')).toEqual(start)
  expect(toPreferences('null')).toEqual(start)
  expect(toPreferences(JSON.stringify({ home: { view: 'tiles' } }))).toEqual(start)
  // The widths the columns were dragged to; anything that is not one is not kept.
  const kept = { home: { view: 'list' }, columns: { sidebar: 360, panel: 'wide' } }
  expect(toPreferences(JSON.stringify(kept)).columns).toEqual({ sidebar: 360, panel: null })
  // The appearance chosen, and nothing that is not one.
  expect(toPreferences(JSON.stringify({ appearance: 'light' })).appearance).toBe('light')
  expect(toPreferences(JSON.stringify({ appearance: 'sepia' })).appearance).toBe('system')
})

const pairing = (device: string) => ({
  device,
  relay: 'wss://relay.test',
  room: `r-${device}`,
  key: 'k',
})

test('the computers kept are read back, and one that cannot be connected to is dropped', () => {
  const kept = [
    { pairing: pairing('d1'), name: 'MacBook' },
    { pairing: pairing('d2'), name: '' },
    { pairing: { device: 'd3' }, name: 'broken' },
    'nonsense',
  ]

  expect(toComputers(JSON.stringify(kept))).toEqual([
    { pairing: pairing('d1'), name: 'MacBook' },
    { pairing: pairing('d2'), name: null },
  ])
  expect(toComputers(null)).toEqual([])
  expect(toComputers('not json')).toEqual([])
})

test('pairing a computer again updates it and keeps its name; a new one is added', () => {
  const computers = [{ pairing: pairing('d1'), name: 'MacBook' }]
  const again = { ...pairing('d1'), room: 'new-room' }

  expect(withComputer(computers, again)).toEqual([{ pairing: again, name: 'MacBook' }])
  expect(withComputer(computers, pairing('d2'))).toHaveLength(2)
})

test('the computer in use is the one named, else the first', () => {
  const computers = [
    { pairing: pairing('d1'), name: null },
    { pairing: pairing('d2'), name: null },
  ]

  expect(getActiveComputer(computers, 'd2')?.pairing.device).toBe('d2')
  expect(getActiveComputer(computers, 'gone')?.pairing.device).toBe('d1')
  expect(getActiveComputer([], 'd1')).toBeNull()
})
