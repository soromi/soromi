//Type
import type { SheetConfig } from './types'

export const SHEET: SheetConfig = {
  dismiss: 'Close',
  // iOS shows a modal upright only, unless told otherwise: over an app lying on its side, a sheet
  // would come up turned a quarter.
  orientations: ['portrait', 'portrait-upside-down', 'landscape-left', 'landscape-right'],
}
