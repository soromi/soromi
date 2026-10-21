import type { ReactNode } from 'react'
import type { StyleProp, ViewStyle } from 'react-native'

export type Props = {
  /** How tall it is, in points; its content sits centred in it. */
  height: number
  children?: ReactNode
  style?: StyleProp<ViewStyle>
}

export type BackdropConfig = {
  /** The space between dots, and a dot's radius. */
  spacing: number
  dot: number
  /** How strong the glow is at its middle, from 0 to 1. */
  glow: number
}
