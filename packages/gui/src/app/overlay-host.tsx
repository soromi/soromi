import { useEffect } from 'react'

//Store
import { overlayScope, useAppStore } from '@/stores/app-store'

//Components
import { OverlayScreen } from './overlay-screens'

/**
 * Hosts overlays of one scope over the persistent workspace base. `full`-scope overlays mount
 * at the shell (covering rail + sidebar); `content`-scope ones mount inside the content column.
 * The `full` host owns Esc-to-pop for the whole stack.
 */
export function OverlayHost({
  scope,
  handleEsc,
}: {
  scope: 'full' | 'content'
  handleEsc?: boolean
}) {
  const overlays = useAppStore((s) => s.overlays)
  const popOverlay = useAppStore((s) => s.popOverlay)

  useEffect(() => {
    if (!handleEsc || overlays.length === 0) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') popOverlay()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [handleEsc, overlays.length, popOverlay])

  return (
    <>
      {overlays
        .filter((overlay) => overlayScope(overlay) === scope)
        .map((overlay) => (
          <OverlayScreen key={overlay.id} overlay={overlay} />
        ))}
    </>
  )
}
