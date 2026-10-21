import * as Device from 'expo-device'

//Helpers
import { toDeviceName } from './device.helpers'

/** This phone, as its system describes it. This is the only place that imports the device module. */
export const DeviceService = {
  /** What the computer lists this phone as: the name its owner gave it, or its model. */
  name: (): string => toDeviceName(Device.deviceName, Device.modelName),
}
