import { expect, test } from 'vitest'

import { clampWidth, getPanelMax, getSidebarMax } from './use-resizable.helpers'

test('a dragged width stays between its least and its most', () => {
  expect(clampWidth(200, 240, 480)).toBe(240)
  expect(clampWidth(600, 240, 480)).toBe(480)
  expect(clampWidth(330, 240, 480)).toBe(330)
  // A window too narrow for the most leaves the least.
  expect(clampWidth(330, 240, 100)).toBe(240)
})

test('the sessions column takes at most a share of the window, and never less than its least', () => {
  expect(getSidebarMax(1366)).toBe(480)
  expect(getSidebarMax(1000)).toBe(400)
  expect(getSidebarMax(500)).toBe(240)
})

test('a docked panel leaves the conversation room to read; one over it, a strip to tap', () => {
  expect(getPanelMax(1366, 320, true)).toBe(640)
  expect(getPanelMax(1100, 320, true)).toBe(420)
  expect(getPanelMax(900, 320, false)).toBe(532)
  expect(getPanelMax(700, 320, true)).toBe(300)
})
