import { Suspense, lazy } from 'react'

//Components
import { OverlayShell } from '@/shared/overlay-shell'

//Types
import type { Overlay } from '@/stores/app-store'

type FileOverlay = Extract<Overlay, { type: 'file' }>

// The editor pulls in CodeMirror, so keep it out of the initial bundle. Shared with the web app.
const CodeViewer = lazy(() =>
  import('@soromi/ui/code-viewer').then((module) => ({ default: module.CodeViewer })),
)

/** Read-only preview of a file, overlaid on the terminal. */
export function FilePreview({ overlay }: { overlay: FileOverlay }) {
  const { path, content: file } = overlay

  return (
    <OverlayShell
      title={path}
      extra={<span className="text-[11px] text-[var(--soromi-text-faint)]">read-only</span>}
    >
      <div className="flex min-h-0 flex-1 flex-col">
        {!file ? (
          <span className="p-3 text-[var(--soromi-text-faint)]">Loading…</span>
        ) : file.binary ? (
          <span className="p-3 text-[var(--soromi-text-faint)]">Binary file — not shown.</span>
        ) : (
          <Suspense
            fallback={<span className="p-3 text-[var(--soromi-text-faint)]">Loading…</span>}
          >
            <CodeViewer value={file.content} path={path} />
          </Suspense>
        )}
        {file?.truncated && (
          <div className="px-3 py-2 text-[var(--soromi-text-faint)]">… truncated (large file)</div>
        )}
      </div>
    </OverlayShell>
  )
}
