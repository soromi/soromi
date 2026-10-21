import { create as createZustandStore } from 'zustand'

//Type
import type { StateCreator, StoreApi } from 'zustand'

/** How to put each store back to how it started, filled in as stores are made. */
const resetters = new Set<() => void>()

/** Every store in this app groups its actions, and may bring its own `reset`. */
type Resettable = { actions?: { reset?: () => void } }

/**
 * Records how to reset a store. `create` does this for the stores it makes; a store built
 * elsewhere (the daemon's, from `@soromi/core`) is registered by hand.
 */
export const register = <T>(store: StoreApi<T>) => {
  const initial = store.getInitialState()

  resetters.add(() => {
    const own = (store.getState() as Resettable).actions?.reset
    if (own) {
      own()
      return
    }

    // `true` replaces rather than merges, so keys added since creation go too.
    store.setState(initial, true)
  })
}

/**
 * Drop-in for zustand's `create` that also records how to reset the store. Zustand keeps no
 * registry of its own, so the alternative is naming every store by hand wherever they are reset,
 * which quietly misses the next one someone adds.
 */
export const create = ((initializer?: unknown) => {
  // `create<T>()(fn)`: the curried form every store in this app uses.
  if (initializer === undefined) {
    return (fn: StateCreator<unknown>) => {
      const store = createZustandStore(fn)
      register(store)

      return store
    }
  }

  const store = createZustandStore(initializer as StateCreator<unknown>)
  register(store)

  return store
}) as typeof createZustandStore

/** Resets every store registered in this app. */
export const resetAllStores = () => {
  for (const reset of resetters) {
    reset()
  }
}
