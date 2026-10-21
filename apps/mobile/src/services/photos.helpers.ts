//Constants
import { PHOTOS } from './photos.constants'

//Type
import type { Attachment } from '@/states/chat/chat.state.type'
import type { PickedAsset } from './photos.type'

/** A picked picture as an attachment, or `null` when the library gave no bytes for it. */
export const toAttachment = (asset: PickedAsset): Attachment | null => {
  if (!asset.base64) return null

  return {
    uri: asset.uri,
    file: {
      mediaType: asset.mimeType ?? PHOTOS.fallbackType,
      data: asset.base64,
      ...(asset.fileName ? { filename: asset.fileName } : {}),
    },
  }
}

/** Every picked picture that came with its bytes. */
export const toAttachments = (assets: PickedAsset[]): Attachment[] =>
  assets.map(toAttachment).filter((one): one is Attachment => one !== null)
