import * as DocumentPicker from 'expo-document-picker'
import { File } from 'expo-file-system'

//Helpers
import { toDocumentType } from './documents.helpers'

//Type
import type { Attachment } from '@/states/chat/chat.state.type'
import type { PickedDocuments } from './documents.type'

/**
 * Files from the phone (its storage, its cloud drives), through the system's own picker, which
 * hands over only the files picked. This is the only place that imports the picker or reads a
 * file's bytes.
 */
export const DocumentService = {
  /** Lets the user pick files: those the agent can read come back, the rest are counted. */
  pick: async (): Promise<PickedDocuments> => {
    const result = await DocumentPicker.getDocumentAsync({
      multiple: true,
      copyToCacheDirectory: true,
    })
    if (result.canceled) return { accepted: [], unsupported: 0 }

    const accepted: Attachment[] = []
    let unsupported = 0
    for (const asset of result.assets) {
      const mediaType = toDocumentType(asset.name, asset.mimeType)
      if (!mediaType) {
        unsupported += 1
        continue
      }
      try {
        const data = await new File(asset.uri).base64()
        accepted.push({ uri: asset.uri, file: { mediaType, data, filename: asset.name } })
      } catch {
        unsupported += 1
      }
    }

    return { accepted, unsupported }
  },
}
