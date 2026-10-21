import { useEffect, useRef, useState } from 'react'

//Constants
import { CHAT } from '../constants/chat'

//Helpers
import { getElapsedSeconds } from '../helpers'

/**
 * Whole seconds since `since`, ticking once a second. With no start to go on it counts from when
 * it was first asked.
 */
export const useElapsed = (since: number | null): number => {
  const fallback = useRef(Date.now())
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), CHAT.working.tickMs)

    return () => clearInterval(timer)
  }, [])

  return getElapsedSeconds(since ?? fallback.current, now)
}
