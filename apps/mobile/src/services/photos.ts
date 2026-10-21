import * as ImagePicker from 'expo-image-picker'

//Constants
import { PHOTOS } from './photos.constants'

//Helpers
import { toAttachments } from './photos.helpers'

//Type
import type { Attachment } from '@/states/chat/chat.state.type'

/**
 * The phone's photo library and its camera. The system's own picker is used for the library, which
 * hands over only the pictures the user picks, so there is no permission to ask for there; the
 * camera asks once. This is the only place that imports the picker.
 */
export const PhotoService = {
  /** Lets the user pick up to `limit` pictures. Empty when they pick none. */
  pick: async (limit: number): Promise<Attachment[]> => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      base64: true,
      quality: PHOTOS.quality,
      allowsMultipleSelection: limit > 1,
      selectionLimit: limit,
    })
    if (result.canceled) return []

    return toAttachments(result.assets)
  },

  /** Takes a picture with the camera. Empty when the user puts it away, or will not allow it. */
  take: async (): Promise<Attachment[] | 'denied'> => {
    const permission = await ImagePicker.requestCameraPermissionsAsync()
    if (!permission.granted) return 'denied'
    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ['images'],
      base64: true,
      quality: PHOTOS.quality,
    })
    if (result.canceled) return []

    return toAttachments(result.assets)
  },
}
