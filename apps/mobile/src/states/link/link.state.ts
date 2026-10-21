//State
import { create } from '../create'

//Type
import type { LinkConnection, LinkType } from './link.state.type'

/** A function, so `reset` never hands the store an object it already holds. */
const initialConnection = (): LinkConnection => ({
  status: 'connecting',
  route: null,
  error: null,
})

/** The phone's own state about its link. What the daemon streams is in `DaemonStore`. */
export const LinkStore = create<LinkType>()((set) => ({
  pairing: { current: null, loaded: false },
  connection: initialConnection(),
  actions: {
    setLoaded: (current) => set({ pairing: { current, loaded: true } }),
    setPairing: (current) => set((state) => ({ pairing: { ...state.pairing, current } })),
    setStatus: (status) => set((state) => ({ connection: { ...state.connection, status } })),
    setRoute: (route) => set((state) => ({ connection: { ...state.connection, route } })),
    setError: (error) => set((state) => ({ connection: { ...state.connection, error } })),
    reset: () => set({ pairing: { current: null, loaded: true }, connection: initialConnection() }),
  },
}))
