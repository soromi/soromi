import type { TextInputProps } from 'react-native'

export type Props = TextInputProps & {
  /** Monospace, for codes and anything read character by character. */
  mono?: boolean
  /** No surface or padding of its own, for a box that sits inside a card. */
  bare?: boolean
}
