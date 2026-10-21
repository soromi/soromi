//Config
import { appConfig } from '@/config/app'

//Type
import type { PairingConfig } from '../types'

export const PAIRING: PairingConfig = {
  steps:
    'On your computer, open Soromi, click the devices button in the status bar, choose “Show the pairing code”, and scan it here.',
  hero: { height: 200 },
  errors: {
    'not-a-code': "That isn't a Soromi pairing code.",
    'unsupported-version': 'That code is from a newer Soromi. Update this app, then scan again.',
    save: "Couldn't save the pairing on this phone.",
  },
  camera: {
    prompt: 'Soromi needs the camera to scan the pairing code.',
    allow: 'Allow camera',
    barcode: { barcodeTypes: ['qr'] },
  },
  paste: {
    label: 'Or paste the code',
    placeholder: `${appConfig.pairing.prefix}…`,
    submit: 'Pair with this code',
  },
}
