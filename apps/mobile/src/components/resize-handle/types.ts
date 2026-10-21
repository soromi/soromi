export type Props = {
  /** Which edge of its column it is on. */
  edge: 'left' | 'right'
  /** What it resizes, for a screen reader. */
  label: string
  onStart: () => void
  /** How far it has been dragged since it was taken hold of, in points: right is positive. */
  onMove: (dx: number) => void
  onEnd: () => void
  /** A screen reader's swipe: `1` widens the column one step, `-1` narrows it. */
  onStep: (direction: 1 | -1) => void
}
