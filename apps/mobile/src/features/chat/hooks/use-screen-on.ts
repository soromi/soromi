import { useIsFocused } from 'expo-router'
import { useEffect } from 'react'

//Services
import { ScreenService } from '@/services/screen'

/**
 * Keeps the phone's screen from dimming while a conversation is on it and its agent is working,
 * so the work can be followed without touching the phone. Leaving the conversation, or the turn
 * ending, lets the screen dim as usual again.
 */
export const useScreenOn = (session: string, working: boolean) => {
  const focused = useIsFocused()
  const hold = focused && working

  useEffect(() => {
    if (!hold) return
    const name = `chat:${session}`
    void ScreenService.keepOn(name)

    return () => void ScreenService.release(name)
  }, [hold, session])
}
