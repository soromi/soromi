import { useEffect } from 'react'

//Store
import { useAppStore } from '@/stores/app-store'

//Components
import { OverlayScreen } from './overlay-screens'

/** Hosts the overlay stack over the persistent workspace base; Esc pops the top layer. */
export function OverlayHost() {
  const overlays = useAppStore((s) => s.overlays)
  const popOverlay = useAppStore((s) => s.popOverlay)

  useEffect(() => {
    if (overlays.length === 0) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') popOverlay()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [overlays.length, popOverlay])

  return (
    <>
      {overlays.map((overlay) => (
        <OverlayScreen key={overlay.id} overlay={overlay} />
      ))}
    </>
  )
}
