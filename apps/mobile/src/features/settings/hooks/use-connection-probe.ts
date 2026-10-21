import { useIsFocused } from 'expo-router'
import { useEffect } from 'react'

//Constants
import { SETTINGS } from '../constants/settings'

//Services
import { LinkService } from '@/services/link'

/**
 * Times a round trip to the computer every few seconds while the connection view is on screen and
 * the link is up, so its figures are live. Nothing is timed once the view is left.
 */
export const useConnectionProbe = (online: boolean) => {
  const focused = useIsFocused()
  const probing = focused && online

  useEffect(() => {
    if (!probing) return
    LinkService.measure()
    const timer = setInterval(LinkService.measure, SETTINGS.connection.probeMs)

    return () => clearInterval(timer)
  }, [probing])
}
