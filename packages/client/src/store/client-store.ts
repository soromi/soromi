import { useStore } from 'zustand'

import { createClientStore } from '@soromi/core'

//Types
import type { ClientState, KeyValueStorage } from '@soromi/core'

/** Local storage, where there is one. Reads and writes that fail are treated as nothing stored. */
const storage: KeyValueStorage = {
  get: (key) => {
    try {
      return localStorage.getItem(key)
    } catch {
      return null
    }
  },
  set: (key, value) => {
    try {
      localStorage.setItem(key, value)
    } catch {}
  },
}

const store = createClientStore({ storage })

function useBoundStore(): ClientState
function useBoundStore<T>(selector: (state: ClientState) => T): T
function useBoundStore<T>(selector?: (state: ClientState) => T) {
  return useStore(store, selector as (state: ClientState) => T)
}

/**
 * The daemon-mirrored state as a React hook, with the store's own methods (`getState`,
 * `subscribe`, …) on it for code outside components. The state itself is defined in
 * `@soromi/core`, which every client shares; this binds it to React for the desktop.
 */
export const useClientStore = Object.assign(useBoundStore, store)
