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
import { ComputersService } from '@/services/computers'

/**
 * Pairs the phone with a computer from the code its Soromi shows, however the code arrives:
 * scanned, pasted, or opened as a link (the code is an address this app opens). A code that works
 * adds that computer to the ones the phone is paired with (a code scanned again brings its entry
 * up to date), switches to it, and the app moves on to its sessions.
 */
export const usePair = () => {
  const router = useRouter()
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
        // Added to the computers the phone is paired with, and the one used from now on.
        await ComputersService.add(parsed.pairing)
        router.replace(routes.app.sessions)
      } catch {
        setError(PAIRING.errors.save)
        busy.current = false
      }
    },
    [router],
  )

  const clearError = useCallback(() => setError(null), [])

  // The system camera opens the code as a link to this app.
  const opened = useLinkingURL()
  useEffect(() => {
    if (opened?.startsWith(appConfig.pairing.prefix)) void accept(opened)
  }, [opened, accept])

  return { error, accept, clearError }
}
