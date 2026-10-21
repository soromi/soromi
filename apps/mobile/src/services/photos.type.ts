/** What the photo library hands back for one picture: the fields this app reads. */
export type PickedAsset = {
  uri: string
  /** The picture itself, when it was asked for. */
  base64?: string | null
  mimeType?: string
  fileName?: string | null
}

export type PhotosConfig = {
  /** How hard pictures are compressed, from 0 (smallest) to 1 (as taken). */
  quality: number
  /** What a picture is taken to be when the library does not say. */
  fallbackType: string
}
