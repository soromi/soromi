//Helpers
import { getActiveComputer, withComputer } from './keychain.helpers'
import { isRelayAddress } from './link.helpers'

//Services
import { KeychainService } from './keychain'
import { LinkService } from './link'

//State
import { resetAllStores } from '@/states/create'
import { DaemonStore } from '@/states/daemon/daemon.state'
import { LinkStore } from '@/states/link/link.state'

//Type
import type { Pairing } from '@soromi/core'
import type { Computer } from '@/states/link/link.state.type'

/**
 * Starts over on `computer`: what the stores held came from the one before, so they are cleared,
 * and the link dials this one, its own direct routes first.
 */
const connectTo = async (computer: Computer, computers: Computer[]): Promise<void> => {
  LinkService.disconnect()
  resetAllStores()
  LinkStore.getState().actions.setLoaded(computer.pairing, computers)
  const [clientId, routes] = await Promise.all([
    KeychainService.getClientId(),
    KeychainService.loadRoutes(computer.pairing.device),
  ])
  LinkService.connect(computer.pairing, clientId, routes)
}

/** The computers as the link store holds them, with the one in use. */
const listed = () => {
  const pairing = LinkStore.getState().pairing

  return { computers: pairing.computers, device: pairing.current?.device ?? null }
}

/**
 * The computers this phone is paired with, and moving between them. One is in use at a time: its
 * workspaces are the ones shown, over its link. Every one of them keeps pushing banners to the
 * phone, and a banner from another names it, so a tap can bring it in.
 */
export const ComputersService = {
  /** Reads what the keychain kept and connects to the computer in use, if there is one. */
  boot: async (): Promise<void> => {
    const { computers, active } = await KeychainService.loadComputers()
    const current = getActiveComputer(computers, active)
    LinkStore.getState().actions.setLoaded(current?.pairing ?? null, computers)
    if (!current) return
    const [clientId, routes] = await Promise.all([
      KeychainService.getClientId(),
      KeychainService.loadRoutes(current.pairing.device),
    ])
    LinkService.connect(current.pairing, clientId, routes)
  },

  /**
   * Keeps each computer's name as it gives it (in its answer to `hello`), for the switcher to
   * show. Returns how to stop.
   */
  followNames: (): (() => void) =>
    DaemonStore.subscribe((state, before) => {
      const name = state.host?.name
      if (!name || state.host === before.host) return
      const { computers, device } = listed()
      const current = computers.find((one) => one.pairing.device === device)
      if (!current || current.name === name) return
      const named = computers.map((one) => (one === current ? { ...one, name } : one))
      LinkStore.getState().actions.setComputers(named)
      void KeychainService.saveComputers(named, device)
    }),

  /**
   * Keeps the relay the computer in use says it is reached through, when it is not the one its
   * pairing has: a computer that moved to another relay is still reached, without pairing again.
   * Returns how to stop.
   */
  followRelay: (): (() => void) =>
    LinkService.onRelay((url) => {
      const current = LinkStore.getState().pairing.current
      if (!current || current.relay === url || !isRelayAddress(url)) return
      void ComputersService.setRelay(url)
    }),

  /** Brings in another computer the phone is paired with. Nothing happens for the one in use. */
  use: async (device: string): Promise<void> => {
    const { computers, device: current } = listed()
    const next = computers.find((one) => one.pairing.device === device)
    if (!next || device === current) return
    await KeychainService.saveComputers(computers, device)
    await connectTo(next, computers)
  },

  /**
   * Has the phone reach the computer in use through another relay, one it moved to since the
   * pairing code was made: the pairing keeps it, and the link dials it at once. What the stores
   * hold stays; it is the same computer.
   */
  setRelay: async (relay: string): Promise<void> => {
    const { computers, device } = listed()
    const current = computers.find((one) => one.pairing.device === device)
    if (!current || current.pairing.relay === relay) return
    const pairing = { ...current.pairing, relay }
    const next = computers.map((one) => (one === current ? { ...one, pairing } : one))
    await KeychainService.saveComputers(next, device)
    LinkStore.getState().actions.setComputers(next)
    LinkStore.getState().actions.setPairing(pairing)
    const [clientId, routes] = await Promise.all([
      KeychainService.getClientId(),
      KeychainService.loadRoutes(pairing.device),
    ])
    LinkService.connect(pairing, clientId, routes)
  },

  /** A code was scanned: the computer is added (or brought up to date, scanned again) and used. */
  add: async (pairing: Pairing): Promise<void> => {
    const computers = withComputer(listed().computers, pairing)
    await KeychainService.saveComputers(computers, pairing.device)
    const added = computers.find((one) => one.pairing.device === pairing.device)
    if (added) await connectTo(added, computers)
  },

  /**
   * Forgets the computer in use, then goes on with another one the phone is paired with, or none.
   * The computer keeps its side until the device is revoked there.
   */
  forgetCurrent: async (): Promise<void> => {
    const { computers, device } = listed()
    // Nothing more is to be pushed from it; the other computers keep the token.
    LinkService.stopPushHere()
    const remaining = computers.filter((one) => one.pairing.device !== device)
    if (device) await KeychainService.forgetComputer(device)
    await KeychainService.saveComputers(remaining, remaining[0]?.pairing.device ?? null)
    const next = remaining[0]
    if (next) {
      await connectTo(next, remaining)
      return
    }
    LinkService.disconnect()
    resetAllStores()
  },
}
