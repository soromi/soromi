/** One bar of the mark: how wide it is, and how its opacity runs over one loop. */
export type Bar = {
  id: string
  width: number
  /** Points in the loop, from 0 to 1. */
  inputRange: number[]
  /** The bar's opacity at each of those points. */
  outputRange: number[]
}

export type WorkingMarkConfig = {
  /** One loop, in milliseconds. */
  duration: number
  bars: Bar[]
}
