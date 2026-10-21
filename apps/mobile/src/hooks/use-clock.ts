import { useEffect, useState } from 'react'

/** How often the time a screen counts from moves on: what it shows from it is to the minute. */
const TICK_MS = 60_000

/** The time now, in Unix seconds, taken again every minute while the screen is shown. */
export const useClock = (): number => {
  const [now, setNow] = useState(() => Date.now() / 1000)

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now() / 1000), TICK_MS)

    return () => clearInterval(timer)
  }, [])

  return now
}
