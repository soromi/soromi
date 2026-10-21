//Type
import type { SettingsConfig } from '../types'

export const SETTINGS: SettingsConfig = {
  open: 'Settings',
  computer: {
    title: 'Computer',
    about: 'This phone is paired with a computer, and shows the workspaces and sessions on it.',
  },
  unpair: {
    action: 'Unpair this phone',
    hint: 'The phone forgets your computer, and the terminals opened from it are closed.',
    title: 'Unpair this phone?',
    message:
      'It will forget your computer. To cut off access for good, also revoke this device in Soromi on the computer.',
    cancel: 'Cancel',
    confirm: 'Unpair',
  },
}
