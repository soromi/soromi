//State
import { create } from '../create'

//Type
import type { LinkConnection, LinkQuality, LinkType } from './link.state.type'

/** How many round trips the connection view averages over. */
const SAMPLES_KEPT = 20

/** A function, so `reset` never hands the store an object it already holds. */
const initialConnection = (): LinkConnection => ({
  status: 'connecting',
  route: null,
  error: null,
})

const initialQuality = (): LinkQuality => ({ samples: [], drops: 0, since: null })

/** The phone's own state about its link. What the daemon streams is in `DaemonStore`. */
export const LinkStore = create<LinkType>()((set) => ({
  pairing: { current: null, computers: [], loaded: false },
  connection: initialConnection(),
  quality: initialQuality(),
  actions: {
    setLoaded: (current, computers) => set({ pairing: { current, computers, loaded: true } }),
    setPairing: (current) => set((state) => ({ pairing: { ...state.pairing, current } })),
    setComputers: (computers) => set((state) => ({ pairing: { ...state.pairing, computers } })),
    setStatus: (status) => set((state) => ({ connection: { ...state.connection, status } })),
    setRoute: (route) => set((state) => ({ connection: { ...state.connection, route } })),
    setError: (error) => set((state) => ({ connection: { ...state.connection, error } })),
    addSample: (ms) =>
      set((state) => ({
        quality: { ...state.quality, samples: [...state.quality.samples, ms].slice(-SAMPLES_KEPT) },
      })),
    // A new route is a new link: what was timed on the last one says nothing about this one.
    linkUp: () =>
      set((state) => ({ quality: { ...state.quality, samples: [], since: Date.now() } })),
    linkDown: () =>
      set((state) =>
        state.quality.since === null
          ? state
          : { quality: { ...state.quality, drops: state.quality.drops + 1, since: null } },
      ),
    reset: () =>
      set({
        pairing: { current: null, computers: [], loaded: true },
        connection: initialConnection(),
        quality: initialQuality(),
      }),
  },
}))
