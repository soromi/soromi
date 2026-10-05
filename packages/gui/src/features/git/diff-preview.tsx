//Packages
import { DiffViewer } from '@soromi/ui/diff-viewer'

//Components
import { DockedPanel } from '@/features/files/docked-panel'

//Types
import type { Overlay } from '@/stores/app-store'

type DiffOverlay = Extract<Overlay, { type: 'diff' }>

/** A file's git diff, docked on the right like the file viewer (read-only). */
export function DiffPreview({ overlay }: { overlay: DiffOverlay }) {
  const { path, staged, patch, truncated } = overlay
  const fileName = path.split('/').pop() || path

  return (
    <DockedPanel
      name={fileName}
      subtitle={path}
      extra={
        <span className="flex-none text-[11px] text-[var(--soromi-text-faint)]">
          {staged ? 'staged' : 'changes'}
        </span>
      }
    >
      {patch === null ? (
        <span className="p-3 text-[var(--soromi-text-faint)]">Loading…</span>
      ) : (
        <DiffViewer patch={patch} truncated={truncated} />
      )}
    </DockedPanel>
  )
}
