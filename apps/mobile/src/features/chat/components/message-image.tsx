//Components
import { OpenPicture } from './open-picture'

//Type
import type { MessageImageProps } from '../types'

/** A picture sent with a message, as a tile; a tap opens it at full size. */
export const MessageImage = (props: MessageImageProps) => (
  <OpenPicture file={props.file} size="tile" />
)
