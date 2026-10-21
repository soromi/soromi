/** The names things are kept under in the device's keychain. */
export const KEYCHAIN = {
  /** The one pairing builds kept before a phone could be paired with several computers. */
  pairing: 'soromi.pairing',
  computers: 'soromi.computers',
  /** The device id of the computer in use. */
  active: 'soromi.computer',
  clientId: 'soromi.clientId',
  /** The routes builds kept before there were several computers; now one entry per computer. */
  routes: 'soromi.routes',
  routesOf: (device: string) => `soromi.routes.${device}`,
  shells: 'soromi.shells',
  preferences: 'soromi.preferences',
} as const
