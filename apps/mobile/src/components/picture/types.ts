export type Props = {
  /** The picture's media type: `image/png`, `image/svg+xml`, … */
  mediaType: string
  /** Its bytes, in base64. */
  data: string
  /** For a screen reader: what the picture is. */
  label: string
}
