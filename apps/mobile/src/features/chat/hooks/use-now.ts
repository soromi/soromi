import { useEffect, useState } from 'react'

//Constants
import { CHAT } from '../constants/chat'

/** Now, in whole seconds, moving on once a second while `active`; still otherwise. */
export const useNow = (active: boolean): number => {
  const [now, setNow] = useState(() => Math.floor(Date.now() / 1000))

  useEffect(() => {
    if (!active) return
    setNow(Math.floor(Date.now() / 1000))
    const timer = setInterval(() => setNow(Math.floor(Date.now() / 1000)), CHAT.working.tickMs)

    return () => clearInterval(timer)
  }, [active])

  return now
}
