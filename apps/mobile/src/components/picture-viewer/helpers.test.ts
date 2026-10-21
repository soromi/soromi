import { expect, test } from 'vitest'

import {
  clampOffset,
  getDistance,
  getDoubleTapPlacement,
  getPinchScale,
  isDoubleTap,
} from './helpers'

test('a pinch grows the picture as the fingers spread, from 1× to 4×', () => {
  expect(getDistance({ x: 0, y: 0 }, { x: 3, y: 4 })).toBe(5)
  expect(getPinchScale(1, 100, 200)).toBe(2)
  expect(getPinchScale(2, 100, 50)).toBe(1)
  expect(getPinchScale(1, 100, 1000)).toBe(4)
  expect(getPinchScale(1, 100, 20)).toBe(1)
  expect(getPinchScale(1.5, 0, 100)).toBe(1.5)
})

test('a grown picture moves only as far as it still covers its frame', () => {
  expect(clampOffset(500, 1, 400)).toBe(0)
  expect(clampOffset(500, 2, 400)).toBe(200)
  expect(clampOffset(-500, 2, 400)).toBe(-200)
  expect(clampOffset(50, 2, 400)).toBe(50)
})

test('a double tap zooms in, and out again', () => {
  expect(getDoubleTapPlacement({ scale: 1, x: 0, y: 0 })).toEqual({ scale: 2.5, x: 0, y: 0 })
  expect(getDoubleTapPlacement({ scale: 3, x: 40, y: -10 })).toEqual({ scale: 1, x: 0, y: 0 })
  expect(isDoubleTap(150, 2)).toBe(true)
  expect(isDoubleTap(500, 2)).toBe(false)
  expect(isDoubleTap(150, 40)).toBe(false)
})
