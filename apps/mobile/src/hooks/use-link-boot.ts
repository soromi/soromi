import { useEffect } from 'react'
import { AppState } from 'react-native'

//Services
import { KeychainService } from '@/services/keychain'
import { LinkService } from '@/services/link'
import { NetworkService } from '@/services/network'

//State
import { LinkStore } from '@/states/link/link.state'
import { PreferencesStore } from '@/states/preferences/preferences.state'
import { WorkspaceStore } from '@/states/workspace/workspace.state'

/**
 * Starts the app from what it kept: the person's preferences, the pairing, the direct routes the
 * computer last reported and the terminals left open on it. Then it connects. From then on,
 * coming back to the app or changing network has the link checked at once, so it moves between
 * the direct route and the relay as the phone joins and leaves the computer's network.
 */
export const useLinkBoot = () => {
  useEffect(() => {
    const boot = async () => {
      const [pairing, preferences] = await Promise.all([
        KeychainService.loadPairing(),
        KeychainService.loadPreferences(),
      ])
      // Before anything is shown, so the home comes up the way it was left.
      PreferencesStore.getState().actions.load(preferences)
      LinkStore.getState().actions.setLoaded(pairing)
      if (!pairing) return
      const [clientId, routes, shells] = await Promise.all([
        KeychainService.getClientId(),
        KeychainService.loadRoutes(),
        KeychainService.loadShells(),
      ])
      WorkspaceStore.getState().actions.setShells(shells)
      LinkService.connect(pairing, clientId, routes)
    }
    void boot()

    // The terminals opened from here outlive the app on the computer: kept as they change.
    const stopShells = WorkspaceStore.subscribe((state, before) => {
      if (state.shells.lists === before.shells.lists) return
      void KeychainService.saveShells(state.shells.lists)
    })

    const stopPreferences = PreferencesStore.subscribe((state, before) => {
      if (state.home === before.home) return
      void KeychainService.savePreferences({ home: state.home })
    })

    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') LinkService.recheck()
    })
    const stopNetwork = NetworkService.onChange(LinkService.recheck)

    return () => {
      stopShells()
      stopPreferences()
      subscription.remove()
      stopNetwork()
    }
  }, [])
}
