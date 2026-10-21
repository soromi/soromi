//Constants
import { DEVICE } from './device.constants'

/**
 * What to call this device on the computer: the name its owner gave it (Android's "Device name"),
 * else its model ("Pixel 9 Pro", "iPhone 16 Pro"). A name that only says what kind of device it
 * is ("iPhone", which is all iOS answers now) gives way to the model, which says more.
 */
export const toDeviceName = (given: string | null, model: string | null): string => {
  const name = given?.trim()
  const kind = model?.trim()
  const generic = (DEVICE.generic as readonly string[]).includes(name ?? '')
  if (name && !(generic && kind)) return name

  return kind || DEVICE.fallback
}
