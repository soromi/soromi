import { Suspense, lazy } from 'react'

//Components
import { OverlayShell } from '@/shared/overlay-shell/overlay-shell'

//Styles
import styles from './file-overlay.module.css'

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
      extra={<span className={styles.readonly}>read-only</span>}
    >
      <div className={styles.body}>
        {overlay.content === null ? (
          <span className={styles.note}>Loading…</span>
        ) : overlay.binary ? (
          <span className={styles.note}>Binary file, not shown.</span>
        ) : (
          <Suspense fallback={<span className={styles.note}>Loading…</span>}>
            <CodeViewer value={overlay.content} path={overlay.path} />
          </Suspense>
        )}
        {overlay.truncated && <div className={styles.truncated}>… truncated (large file)</div>}
      </div>
    </OverlayShell>
  )
}
