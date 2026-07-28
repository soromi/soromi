import { useEffect, useState } from 'react'

/**
 * Tracks a CSS media query, replacing Mantine's `useMediaQuery`. Seeds from the current match on the
 * first render (so the correct layout paints on the first frame), falling back to `false` outside a
 * browser.
 */
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(() =>
    typeof window === 'undefined' ? false : window.matchMedia(query).matches,
  )

  useEffect(() => {
    const list = window.matchMedia(query)
    setMatches(list.matches)

    const onChange = (event: MediaQueryListEvent) => setMatches(event.matches)
    list.addEventListener('change', onChange)

    return () => list.removeEventListener('change', onChange)
  }, [query])

  return matches
}
