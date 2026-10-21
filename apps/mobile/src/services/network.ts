import * as Network from 'expo-network'

/**
 * The phone's network, as far as the app cares: that it changed. Joining or leaving a Wi-Fi is
 * when the route to the computer may have to change too. This is the only place that imports the
 * network module.
 */
export const NetworkService = {
  /** Calls `listener` each time the phone's network changes; returns how to stop. */
  onChange: (listener: () => void): (() => void) => {
    const subscription = Network.addNetworkStateListener(() => listener())

    return () => subscription.remove()
  },
}
