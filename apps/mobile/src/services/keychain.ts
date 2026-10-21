import { randomUUID } from 'expo-crypto'
import * as SecureStore from 'expo-secure-store'

//Constants
import { KEYCHAIN } from './keychain.constants'

//Helpers
import { toPreferences, toRoutes, toShells } from './keychain.helpers'

//Type
import type { Pairing } from '@soromi/core'
import type { Preferences } from '@/states/preferences/preferences.state.type'
import type { Shell } from '@/states/workspace/workspace.state.type'

/**
 * What the app keeps in the device's keychain: the pairing with the user's computer (it holds the
 * secret the link's encryption is keyed from), the direct routes that computer last reported, the
 * terminals opened on it from here, this install's id, and the person's preferences (the one
 * place the app has to keep anything). Nothing else imports `expo-secure-store`.
 */
export const KeychainService = {
  /** The stored pairing, or `null` until a code has been scanned. */
  loadPairing: async (): Promise<Pairing | null> => {
    try {
      const stored = await SecureStore.getItemAsync(KEYCHAIN.pairing)
      if (!stored) return null
      const pairing = JSON.parse(stored) as Partial<Pairing>
      if (!pairing.relay || !pairing.room || !pairing.key || !pairing.device) return null

      return pairing as Pairing
    } catch {
      return null
    }
  },

  /**
   * Keeps a pairing. The routes and terminals kept for the one before it are dropped: they were
   * another computer's.
   */
  savePairing: async (pairing: Pairing): Promise<void> => {
    await SecureStore.setItemAsync(KEYCHAIN.pairing, JSON.stringify(pairing))
    await SecureStore.deleteItemAsync(KEYCHAIN.routes)
    await SecureStore.deleteItemAsync(KEYCHAIN.shells)
  },

  forgetPairing: async (): Promise<void> => {
    await SecureStore.deleteItemAsync(KEYCHAIN.pairing)
    await SecureStore.deleteItemAsync(KEYCHAIN.routes)
    await SecureStore.deleteItemAsync(KEYCHAIN.shells)
  },

  /**
   * The terminals opened on the computer from here, by workspace. They keep running there when the
   * app is closed, so they are kept: the next launch shows them again, to go on with or to close.
   */
  loadShells: async (): Promise<Record<string, Shell[]>> => {
    try {
      return toShells(await SecureStore.getItemAsync(KEYCHAIN.shells))
    } catch {
      return {}
    }
  },

  saveShells: async (lists: Record<string, Shell[]>): Promise<void> => {
    try {
      await SecureStore.setItemAsync(KEYCHAIN.shells, JSON.stringify(lists))
    } catch {
      // The terminals still work for as long as the app runs.
    }
  },

  /**
   * Where the computer said it can be reached directly, the last time it was asked. Empty until it
   * has said, and whenever what is stored cannot be read.
   */
  loadRoutes: async (): Promise<string[]> => {
    try {
      return toRoutes(await SecureStore.getItemAsync(KEYCHAIN.routes))
    } catch {
      return []
    }
  },

  /** Kept so the next launch can try them at once, before the relay has said anything. */
  saveRoutes: async (routes: string[]): Promise<void> => {
    try {
      await SecureStore.setItemAsync(KEYCHAIN.routes, JSON.stringify(routes))
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
