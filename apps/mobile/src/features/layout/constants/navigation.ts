//Type
import type { NavigationConfig } from '../types'

export const NAVIGATION: NavigationConfig = {
  animation: {
    narrow: 'default',
    wide: 'none',
  },
  screens: {
    sessions: { title: 'Soromi' },
    settings: { title: 'Settings' },
    pair: { title: 'Pair with your computer' },
    session: { title: '' },
    panel: { title: '' },
    file: { title: '' },
    diff: { title: '' },
  },
}
