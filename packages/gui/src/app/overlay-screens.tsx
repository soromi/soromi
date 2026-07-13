//Utils
import { assertNever } from '@/lib/assert-never'

//Components
import { FilePreview } from '@/features/files/file-preview'
import { Settings } from '@/features/settings/settings'
import { WorkspaceSettings } from '@/features/workspaces/workspace-settings'
import { CreateSpaceOverlay } from '@/features/welcome/welcome'

//Types
import type { Overlay } from '@/stores/app-store'

/**
 * Maps an overlay to its screen. The `assertNever` default makes a new overlay type a
 * compile error until it is handled here.
 */
export function OverlayScreen({ overlay }: { overlay: Overlay }) {
  switch (overlay.type) {
    case 'file':
      return <FilePreview overlay={overlay} />
    case 'create-space':
      return <CreateSpaceOverlay />
    case 'settings':
      return <Settings />
    case 'workspace-settings':
      return <WorkspaceSettings workspace={overlay.workspace} />
    default:
      return assertNever(overlay)
  }
}
