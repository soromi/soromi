import type { AccessibilityActionInfo } from 'react-native'

export const RESIZE_HANDLE = {
  /** The width of the strip that takes hold of the edge. */
  width: 14,
  /** What a screen reader offers on it. */
  actions: [
    { name: 'increment', label: 'Wider' },
    { name: 'decrement', label: 'Narrower' },
  ] as AccessibilityActionInfo[],
  hint: 'Drag to make it wider or narrower.',
} as const
