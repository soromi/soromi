import type { Pairing } from '@soromi/core'
import type { DeviceRoute } from '@soromi/protocol'

/** Where the link to the computer stands, as the user needs to know it. */
export type LinkStatus =
  /** Dialing the computer, or waiting for it to answer. */
  | 'connecting'
  /** Talking to the daemon. */
  | 'online'
  /** The relay is reachable but the computer is not there: off, asleep, or Soromi not running. */
  | 'computer-offline'
  /** This pairing was opened on another device, which now holds the link. */
  | 'replaced'
  /** The computer's Soromi is newer than this app can talk to. */
  | 'update-app'
  /** This app is newer than the computer's Soromi can talk to. */
  | 'update-desktop'

export type LinkPairing = {
  /** The pairing with the user's computer; `null` if the phone is not paired. */
  current: Pairing | null
  /** True once the keychain has been read. */
  loaded: boolean
}

export type LinkConnection = {
  status: LinkStatus
  /**
   * Which way the link goes while it is up: straight to the computer on a shared network, or
   * through the relay. `null` while it is down.
   */
  route: DeviceRoute | null
  /** The last error the daemon reported. */
  error: string | null
}

export type LinkActions = {
  /** The keychain was read: this is what it held. */
  setLoaded: (pairing: Pairing | null) => void
  setPairing: (pairing: Pairing | null) => void
  setStatus: (status: LinkStatus) => void
  setRoute: (route: DeviceRoute | null) => void
  setError: (error: string | null) => void
  /** Back to an unpaired phone. The keychain stays read. */
  reset: () => void
}

export type LinkType = {
  pairing: LinkPairing
  connection: LinkConnection
  /** Grouped so the object stays reference-stable: `useLinkActions` needs no shallow compare. */
  actions: LinkActions
}
