//Type
import type { PhotosConfig } from './photos.type'

export const PHOTOS: PhotosConfig = {
  // A message crosses the relay in one piece of limited size, and the agent reads a photo just as
  // well at this quality.
  quality: 0.6,
  fallbackType: 'image/jpeg',
}
