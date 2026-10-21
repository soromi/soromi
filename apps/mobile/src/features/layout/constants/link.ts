//Type
import type { LinkConfig } from '../types'

export const LINK: LinkConfig = {
  messages: {
    connecting: 'Connecting to your computer…',
    'computer-offline':
      'Can’t reach your computer. It may be asleep or off. Soromi keeps it awake while you are connected; to reach it at any time, set Keep awake to Always on it.',
    replaced: 'This pairing is open on another device.',
    'update-app': 'Your computer runs a newer Soromi. Update this app to connect.',
    'update-desktop': 'This app is newer than the Soromi on your computer. Update it there.',
  },
  actions: {
    'computer-offline': 'Retry',
    replaced: 'Use here',
  },
  routes: {
    direct: { label: 'Local', icon: 'wifi' },
    relay: { label: 'Relay', icon: 'cloud' },
  },
}
