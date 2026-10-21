import { useMemo } from 'react'
import { useWindowDimensions } from 'react-native'

//Config
import { layout } from '@/config/layout'

/**
 * Which layout the window's width calls for, kept current as it changes (a tablet turned on its
 * side, an app sharing the screen): `wide` when there is room for the sessions column, `docked`
 * when there is room for a session's panel beside the conversation as well, and how many
 * `columns` of cards the home's grid has.
 */
export const useLayout = () => {
  const { width } = useWindowDimensions()

  return useMemo(
    () => ({
      wide: width >= layout.breakpoints.wide,
      docked: width >= layout.breakpoints.docked,
      // Never fewer than two: one card a row is the list.
      columns: Math.max(2, Math.floor(width / layout.card)),
    }),
    [width],
  )
}
