//Constants
import { VIEWER } from './constants'

//Type
import type { Placement, Point } from './types'

/** How far apart two fingers are. */
export const getDistance = (a: Point, b: Point): number => Math.hypot(a.x - b.x, a.y - b.y)

/** A pinch's scale: the one it started at, grown as the fingers spread, kept from 1× to the most. */
export const getPinchScale = (start: number, from: number, to: number): number =>
  from <= 0 ? start : Math.min(VIEWER.maxScale, Math.max(1, (start * to) / from))

/**
 * How far a picture shown at `scale` may be moved and still cover its frame: half of what it has
 * grown past the frame, each way. At 1× it cannot move at all.
 */
export const clampOffset = (offset: number, scale: number, size: number): number => {
  const room = ((scale - 1) * size) / 2

  return Math.min(room, Math.max(-room, offset))
}

/** Where a double tap takes the picture: in, if it was at its fitted size; back to it otherwise. */
export const getDoubleTapPlacement = (current: Placement): Placement =>
  current.scale > 1 ? { scale: 1, x: 0, y: 0 } : { scale: VIEWER.doubleTapScale, x: 0, y: 0 }

/** Whether a finger lifted after moving this little, this soon after the last, made a double tap. */
export const isDoubleTap = (sinceLast: number, moved: number): boolean =>
  sinceLast < VIEWER.doubleTapMs && moved < VIEWER.tapSlop
