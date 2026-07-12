import { useEffect } from 'react'
import { useShallow } from 'zustand/react/shallow'

//Store
import { useUiStore } from '@/stores/ui-store'

//Utils
import { assertNever } from '@/lib/assert-never'

//Components
import { SidebarDrawer } from '@/features/drawers/sidebar-drawer'
import { WorkspacesDrawer } from '@/features/drawers/workspaces-drawer'

//Types
import type { Overlay } from '@/stores/ui-store'

/**
 * Renders the overlay stack over the persistent terminal base (mirrors the desktop's OverlayHost).
 * Escape pops the top overlay; the terminal underneath is never unmounted.
 */
export function OverlayHost() {
  const { overlays, popOverlay, active, activeSession } = useUiStore(
    useShallow((s) => ({
      overlays: s.overlays,
      popOverlay: s.popOverlay,
      active: s.active,
      activeSession: s.activeSession,
    })),
  )
  const session = active ? activeSession[active] : undefined

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
        <OverlayScreen key={overlay.id} overlay={overlay} workspace={active} session={session} />
      ))}
    </>
  )
}

function OverlayScreen({
  overlay,
  workspace,
  session,
}: {
  overlay: Overlay
  workspace: string | null
  session?: string
}) {
  switch (overlay.type) {
    case 'workspaces':
      return <WorkspacesDrawer />
    case 'sidebar':
      return <SidebarDrawer workspace={workspace ?? undefined} session={session} />
    default:
      return assertNever(overlay)
  }
}
