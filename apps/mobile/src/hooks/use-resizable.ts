import { useCallback, useEffect, useMemo, useRef } from 'react'
import { Animated } from 'react-native'

//Config
import { layout } from '@/config/layout'

//Helpers
import { clampWidth } from './use-resizable.helpers'

//State
import {
  usePreferencesActions,
  usePreferencesColumn,
} from '@/states/preferences/preferences.state.hook'

//Type
import type { Column } from '@/states/preferences/preferences.state.type'

type Options = {
  /** Its width until it has been dragged. */
  fallback: number
  min: number
  max: number
  /** Which way widens it: `1` dragging right (a column at the left), `-1` dragging left. */
  grows: 1 | -1
}

/**
 * A column of a wide screen that the person drags wider or narrower by its edge, as on the
 * desktop. While the edge moves, only the column's width does (an animated value: nothing is drawn
 * again); when it is let go, the width is kept in the phone's preferences, so it is the same the
 * next time. It stays between `min` and `max`, which follow the window. Returns the width to lay
 * the column out with and what its `ResizeHandle` calls.
 */
export const useResizable = (column: Column, options: Options) => {
  const saved = usePreferencesColumn(column)
  const actions = usePreferencesActions()
  const { fallback, min, max, grows } = options
  const width = clampWidth(saved ?? fallback, min, max)

  const animated = useRef(new Animated.Value(width)).current
  // What a drag reads as it goes, without waiting for a render.
  const live = useRef({ width, from: width, min, max })
  live.current.min = min
  live.current.max = max

  // Loaded from the keychain, or the window turned: the column takes the width that now holds.
  useEffect(() => {
    live.current.width = width
    animated.setValue(width)
  }, [width, animated])

  const onStart = useCallback(() => {
    live.current.from = live.current.width
  }, [])

  const onMove = useCallback(
    (dx: number) => {
      const next = clampWidth(live.current.from + grows * dx, live.current.min, live.current.max)
      live.current.width = next
      animated.setValue(next)
    },
    [grows, animated],
  )

  const onEnd = useCallback(
    () => actions.setColumn(column, Math.round(live.current.width)),
    [actions, column],
  )

  const onStep = useCallback(
    (direction: 1 | -1) => {
      const next = clampWidth(
        live.current.width + direction * layout.resize.step,
        live.current.min,
        live.current.max,
      )
      actions.setColumn(column, next)
    },
    [actions, column],
  )

  return useMemo(
    () => ({ width: animated, onStart, onMove, onEnd, onStep }),
    [animated, onStart, onMove, onEnd, onStep],
  )
}
