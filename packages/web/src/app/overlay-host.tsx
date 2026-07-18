import { useEffect } from 'react'
import { useShallow } from 'zustand/react/shallow'

//Store
import { useUiStore } from '@/stores/ui-store'

//Components
import { FileOverlay } from '@/features/files/file-overlay'

//Types
import type { Overlay } from '@/stores/ui-store'

/**
 * Renders the full-page overlay stack over the persistent terminal base (mirrors the desktop's
 * OverlayHost). Escape pops the top overlay; the terminal underneath is never unmounted.
 */
export function OverlayHost() {
  const { overlays, popOverlay } = useUiStore(
    useShallow((s) => ({ overlays: s.overlays, popOverlay: s.popOverlay })),
  )

  useEffect(() => {
    if (overlays.length === 0) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') popOverlay()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [overlays.length, popOverlay])

  return (
    <>
      {overlays.map((overlay) => (
        <OverlayScreen key={overlay.id} overlay={overlay} />
      ))}
    </>
  )
}

// A new overlay kind = add its `type` to the union and a branch here.
function OverlayScreen({ overlay }: { overlay: Overlay }) {
  if (overlay.type === 'file') return <FileOverlay overlay={overlay} />

  return null
}
