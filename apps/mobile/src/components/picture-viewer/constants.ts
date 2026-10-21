//Type
import type { ViewerConfig } from './types'

export const VIEWER: ViewerConfig = {
  close: 'Close picture',
  maxScale: 4,
  doubleTapScale: 2.5,
  doubleTapMs: 280,
  tapSlop: 10,
  // As a sheet: a picture opened on a phone lying on its side comes up the right way.
  orientations: ['portrait', 'portrait-upside-down', 'landscape-left', 'landscape-right'],
}
