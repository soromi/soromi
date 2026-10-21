//State
import { LinkStore } from './link.state'

/**
 * @description Whether the keychain has been read yet
 */
export const useLinkLoaded = () => LinkStore((state) => state.pairing.loaded)

/**
 * @description Whether the phone is paired with a computer
 */
export const useLinkPaired = () => LinkStore((state) => state.pairing.current !== null)

/**
 * @description The relay the phone reaches the computer in use through, when it is not on its
 * network; `undefined` while paired with none
 */
export const useLinkRelay = () => LinkStore((state) => state.pairing.current?.relay)

/**
 * @description Every computer the phone is paired with
 */
export const useLinkComputers = () => LinkStore((state) => state.pairing.computers)

/**
 * @description The id this phone has on the computer in use (which computer that is), if any
 */
export const useLinkDevice = () => LinkStore((state) => state.pairing.current?.device)

/**
 * @description Where the link to the computer stands
 */
export const useLinkStatus = () => LinkStore((state) => state.connection.status)

/**
 * @description Whether the app is talking to the daemon right now
 */
export const useLinkOnline = () => LinkStore((state) => state.connection.status === 'online')

/**
 * @description Which way the link goes while it is up (direct or relay), `null` while it is down
 */
export const useLinkRoute = () => LinkStore((state) => state.connection.route)

/**
 * @description How good the link has been: the latest round trips, the drops, when it came up
 */
export const useLinkQuality = () => LinkStore((state) => state.quality)

/**
 * @description Link actions: a stable reference, so no shallow compare needed
 */
export const useLinkActions = () => LinkStore((state) => state.actions)
