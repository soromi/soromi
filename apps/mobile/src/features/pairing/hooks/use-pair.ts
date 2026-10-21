import { useLinkingURL } from 'expo-linking'
import { useRouter } from 'expo-router'
import { useCallback, useEffect, useRef, useState } from 'react'

import { parsePairingCode } from '@soromi/core'

//Config
import { appConfig } from '@/config/app'
import { routes } from '@/config/router'

//Constants
import { PAIRING } from '../constants/pairing'

//Services
import { KeychainService } from '@/services/keychain'
import { LinkService } from '@/services/link'

//State
import { useLinkActions } from '@/states/link/link.state.hook'
import { WorkspaceStore } from '@/states/workspace/workspace.state'

/**
 * Pairs the phone with a computer from the code its Soromi shows, however the code arrives:
 * scanned, pasted, or opened as a link (the code is an address this app opens). A code that works
 * is kept in the keychain, connected with, and the app moves on to the sessions.
 */
export const usePair = () => {
  const router = useRouter()
  const link = useLinkActions()
  const [error, setError] = useState<string | null>(null)
  // One code at a time: the camera reports the same code many times a second.
  const busy = useRef(false)

  const accept = useCallback(
    async (code: string) => {
      if (busy.current) return
      const parsed = parsePairingCode(code)
      if (!parsed.ok) {
        setError(PAIRING.errors[parsed.error])
        return
      }
      busy.current = true
      try {
        await KeychainService.savePairing(parsed.pairing)
        // The terminals listed were the last computer's.
        WorkspaceStore.getState().actions.setShells({})
        link.setPairing(parsed.pairing)
        LinkService.connect(parsed.pairing, await KeychainService.getClientId())
        router.replace(routes.app.sessions)
      } catch {
        setError(PAIRING.errors.save)
        busy.current = false
      }
    },
    [link, router],
  )

  const clearError = useCallback(() => setError(null), [])

  // The system camera opens the code as a link to this app.
  const opened = useLinkingURL()
  useEffect(() => {
    if (opened?.startsWith(appConfig.pairing.prefix)) void accept(opened)
  }, [opened, accept])

  return { error, accept, clearError }
}
