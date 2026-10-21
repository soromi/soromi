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

/** A computer this phone is paired with: how to reach it, and what it is called once it said. */
export type Computer = {
  pairing: Pairing
  /** Its name, from its answer to `hello`; `null` until it has answered once. */
  name: string | null
}

export type LinkPairing = {
  /** The pairing with the computer in use; `null` if the phone is paired with none. */
  current: Pairing | null
  /** Every computer the phone is paired with, the one in use among them. */
  computers: Computer[]
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

/** How good the link has been, for the connection view. Kept for as long as the app runs. */
export type LinkQuality = {
  /** The latest round trips to the daemon, in milliseconds, oldest first, on the route in use. */
  samples: number[]
  /** How many times the link dropped while it was up, since the app started. */
  drops: number
  /** When the link came up, while it is up (ms since the epoch); `null` while it is down. */
  since: number | null
}

export type LinkActions = {
  /** The keychain was read: the computers it held, and the one in use. */
  setLoaded: (pairing: Pairing | null, computers: Computer[]) => void
  setPairing: (pairing: Pairing | null) => void
  setComputers: (computers: Computer[]) => void
  setStatus: (status: LinkStatus) => void
  setRoute: (route: DeviceRoute | null) => void
  setError: (error: string | null) => void
  /** A round trip to the daemon was timed. */
  addSample: (ms: number) => void
  /** The link came up, on a route or on another one. */
  linkUp: () => void
  /** The link went down. */
  linkDown: () => void
  /** Back to an unpaired phone. The keychain stays read. */
  reset: () => void
}

export type LinkType = {
  pairing: LinkPairing
  connection: LinkConnection
  quality: LinkQuality
  /** Grouped so the object stays reference-stable: `useLinkActions` needs no shallow compare. */
  actions: LinkActions
}
