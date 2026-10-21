import { useEffect } from 'react'
import { AppState } from 'react-native'

//Services
import { ComputersService } from '@/services/computers'
import { KeychainService } from '@/services/keychain'
import { LinkService } from '@/services/link'
import { NetworkService } from '@/services/network'

//State
import { PreferencesStore } from '@/states/preferences/preferences.state'

/**
 * Starts the app from what it kept: the person's preferences, the computers it is paired with and
 * the one in use, and the direct routes that one last reported. Then it connects. From then on,
 * coming back to the app or changing network has the link checked at once, so it moves between
 * the direct route and the relay as the phone joins and leaves the computer's network.
 */
export const useLinkBoot = () => {
  useEffect(() => {
    const boot = async () => {
      // Before anything is shown, so the home comes up the way it was left.
      PreferencesStore.getState().actions.load(await KeychainService.loadPreferences())
      await KeychainService.forgetOldShells()
      await ComputersService.boot()
    }
    void boot()
    const stopNames = ComputersService.followNames()
    // The computer says which relay it is reached through; one that moved is followed.
    const stopRelay = ComputersService.followRelay()

    const stopPreferences = PreferencesStore.subscribe((state, before) => {
      const same =
        state.home === before.home &&
        state.columns === before.columns &&
        state.appearance === before.appearance
      if (same) return
      void KeychainService.savePreferences({
        home: state.home,
        columns: state.columns,
        appearance: state.appearance,
      })
    })

    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') LinkService.recheck()
    })
    const stopNetwork = NetworkService.onChange(LinkService.recheck)

    return () => {
      stopNames()
      stopRelay()
      stopPreferences()
      subscription.remove()
      stopNetwork()
    }
  }, [])
}
