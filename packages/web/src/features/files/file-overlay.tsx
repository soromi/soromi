import { Suspense, lazy } from 'react'

//Components
import { OverlayShell } from '@/shared/overlay-shell/overlay-shell'

//Types
import type { FileOverlay as FileOverlayData } from '@/stores/ui-store'

/** The file's name from its path (`a/b/c.ts` -> `c.ts`). */
const basename = (path: string) => path.slice(path.lastIndexOf('/') + 1)

// The editor pulls in CodeMirror, so keep it out of the initial bundle. Shared with the desktop app.
const CodeViewer = lazy(() =>
  import('@soromi/ui/code-viewer').then((module) => ({ default: module.CodeViewer })),
)

/** Read-only preview of a file, overlaid full-page on the terminal (same viewer as the desktop). */
export function FileOverlay({ overlay }: { overlay: FileOverlayData }) {
  return (
    <OverlayShell
      title={basename(overlay.path)}
      extra={<span className="text-[11px] text-[var(--soromi-text-faint)]">read-only</span>}
    >
      <div className="flex min-h-0 flex-1 flex-col">
        {overlay.content === null ? (
          <span className="p-4 text-[13px] text-[var(--soromi-text-faint)]">Loading…</span>
        ) : overlay.binary ? (
          <span className="p-4 text-[13px] text-[var(--soromi-text-faint)]">
            Binary file, not shown.
          </span>
        ) : (
          <Suspense
            fallback={
              <span className="p-4 text-[13px] text-[var(--soromi-text-faint)]">Loading…</span>
            }
          >
            <CodeViewer value={overlay.content} path={overlay.path} />
          </Suspense>
        )}
        {overlay.truncated && (
          <div className="px-4 py-2 text-[var(--soromi-text-faint)] text-xs">
            … truncated (large file)
          </div>
        )}
      </div>
    </OverlayShell>
  )
}
