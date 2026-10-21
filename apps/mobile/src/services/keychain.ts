import { randomUUID } from 'expo-crypto'
import * as SecureStore from 'expo-secure-store'

//Constants
import { KEYCHAIN } from './keychain.constants'

//Helpers
import { toComputers, toPairing, toPreferences, toRoutes } from './keychain.helpers'

//Type
import type { Computer } from '@/states/link/link.state.type'
import type { Preferences } from '@/states/preferences/preferences.state.type'

/**
 * What the app keeps in the device's keychain: the computers it is paired with (each pairing holds
 * the secret its link's encryption is keyed from) and which one is in use, the direct routes each
 * last reported, this install's id, and the person's preferences (the one place the app has to
 * keep anything). Nothing else imports `expo-secure-store`.
 */
export const KeychainService = {
  /**
   * The computers the phone is paired with and the device id of the one in use. A phone paired by
   * a build that knew only one computer has that one moved into the list, its routes with it.
   */
  loadComputers: async (): Promise<{ computers: Computer[]; active: string | null }> => {
    try {
      const computers = toComputers(await SecureStore.getItemAsync(KEYCHAIN.computers))
      const active = await SecureStore.getItemAsync(KEYCHAIN.active)
      if (computers.length > 0) return { computers, active }

      const single = await SecureStore.getItemAsync(KEYCHAIN.pairing)
      const pairing = single ? toPairing(JSON.parse(single)) : null
      if (!pairing) return { computers: [], active: null }
      const moved = [{ pairing, name: null }]
      await SecureStore.setItemAsync(KEYCHAIN.computers, JSON.stringify(moved))
      await SecureStore.setItemAsync(KEYCHAIN.active, pairing.device)
      const routes = await SecureStore.getItemAsync(KEYCHAIN.routes)
      if (routes) await SecureStore.setItemAsync(KEYCHAIN.routesOf(pairing.device), routes)
      await SecureStore.deleteItemAsync(KEYCHAIN.pairing)
      await SecureStore.deleteItemAsync(KEYCHAIN.routes)

      return { computers: moved, active: pairing.device }
    } catch {
      return { computers: [], active: null }
    }
  },

  /** Keeps the computers, and which one is in use (`null`: none, the phone is paired with none). */
  saveComputers: async (computers: Computer[], active: string | null): Promise<void> => {
    await SecureStore.setItemAsync(KEYCHAIN.computers, JSON.stringify(computers))
    if (active) await SecureStore.setItemAsync(KEYCHAIN.active, active)
    else await SecureStore.deleteItemAsync(KEYCHAIN.active)
  },

  /** What is kept for one computer and nothing else: its routes. Its place in the list goes with `saveComputers`. */
  forgetComputer: async (device: string): Promise<void> => {
    try {
      await SecureStore.deleteItemAsync(KEYCHAIN.routesOf(device))
    } catch {
      // Nothing was kept for it.
    }
  },

  /**
   * Drops the list of terminals that builds before the shared list kept here. The computer keeps
   * the list now, for every device.
   */
  forgetOldShells: async (): Promise<void> => {
    try {
      await SecureStore.deleteItemAsync(KEYCHAIN.shells)
    } catch {
      // Nothing was kept, or it will go with the pairing.
    }
  },

  /**
   * Where the computer said it can be reached directly, the last time it was asked. Empty until it
   * has said, and whenever what is stored cannot be read.
   */
  loadRoutes: async (device: string): Promise<string[]> => {
    try {
      return toRoutes(await SecureStore.getItemAsync(KEYCHAIN.routesOf(device)))
    } catch {
      return []
    }
  },

  /** Kept so the next launch can try them at once, before the relay has said anything. */
  saveRoutes: async (device: string, routes: string[]): Promise<void> => {
    try {
      await SecureStore.setItemAsync(KEYCHAIN.routesOf(device), JSON.stringify(routes))
    } catch {
      // Not worth failing over: the computer says them again on the next connection.
    }
  },

  /** The person's choices about the app. They stay when the phone is unpaired. */
  loadPreferences: async (): Promise<Preferences> => {
    try {
      return toPreferences(await SecureStore.getItemAsync(KEYCHAIN.preferences))
    } catch {
      return toPreferences(null)
    }
  },

  savePreferences: async (preferences: Preferences): Promise<void> => {
    try {
      await SecureStore.setItemAsync(KEYCHAIN.preferences, JSON.stringify(preferences))
    } catch {
      // The choice still holds for as long as the app runs.
    }
  },

  /** A stable id for this install, announced to the daemon. Made on first use. */
  getClientId: async (): Promise<string> => {
    try {
      const stored = await SecureStore.getItemAsync(KEYCHAIN.clientId)
      if (stored) return stored
      const created = randomUUID()
      await SecureStore.setItemAsync(KEYCHAIN.clientId, created)

      return created
    } catch {
      return randomUUID()
    }
  },
}
