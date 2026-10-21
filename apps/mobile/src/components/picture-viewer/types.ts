import type { ModalProps } from 'react-native'

export type Props = {
  visible: boolean
  /** The picture, as a URI the system's decoder reads (a `data:` URI of its bytes). */
  uri: string
  /** For a screen reader: what the picture is. */
  label: string
  onClose: () => void
}

/** Where a finger is, on the screen. */
export type Point = { x: number; y: number }

/** How the picture is placed: how much larger than it fits, and how far it is moved. */
export type Placement = { scale: number; x: number; y: number }

export type ViewerConfig = {
  /** For a screen reader: the close button. */
  close: string
  /** As large as a picture is let to grow, and the size a double tap takes it to. */
  maxScale: number
  doubleTapScale: number
  /** Two taps closer together than this, in time and in points, are a double tap. */
  doubleTapMs: number
  tapSlop: number
  orientations: NonNullable<ModalProps['supportedOrientations']>
}
