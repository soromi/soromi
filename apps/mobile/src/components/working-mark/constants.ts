//Type
import type { WorkingMarkConfig } from './types'

/** Three bars that light up one after the other, top to bottom, and then rest. */
export const WORKING_MARK: WorkingMarkConfig = {
  duration: 1200,
  bars: [
    { id: 'top', width: 10, inputRange: [0, 0.15, 0.4, 1], outputRange: [0.35, 1, 0.35, 0.35] },
    {
      id: 'middle',
      width: 7,
      inputRange: [0, 0.2, 0.35, 0.6, 1],
      outputRange: [0.35, 0.35, 1, 0.35, 0.35],
    },
    {
      id: 'bottom',
      width: 10,
      inputRange: [0, 0.4, 0.55, 0.8, 1],
      outputRange: [0.35, 0.35, 1, 0.35, 0.35],
    },
  ],
}
