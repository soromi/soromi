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
 * @description Link actions: a stable reference, so no shallow compare needed
 */
export const useLinkActions = () => LinkStore((state) => state.actions)
