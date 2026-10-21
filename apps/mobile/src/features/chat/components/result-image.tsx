//Components
import { OpenPicture } from './open-picture'

//Type
import type { ResultImageProps } from '../types'

/**
 * A picture a tool returned (a screenshot it read, say), drawn large enough to look at: it is the
 * result, not an attachment. A tap opens it at full size.
 */
export const ResultImage = (props: ResultImageProps) => (
  <OpenPicture file={props.file} size="panel" />
)
