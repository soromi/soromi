import { expect, test } from 'vitest'

import { toPanelView } from './helpers'

test('the panel opens on the view it was asked for', () => {
  expect(toPanelView('git')).toBe('git')
  expect(toPanelView('terminal')).toBe('terminal')
})

test('asked for nothing it knows, it opens on its files', () => {
  expect(toPanelView(undefined)).toBe('files')
  expect(toPanelView('settings')).toBe('files')
})
