import { Suspense, lazy } from 'react'

//Components
import { OverlayShell } from '@/shared/overlay-shell'

//Styles
import styles from './file-preview.module.css'

//Types
import type { Overlay } from '@/stores/app-store'

type FileOverlay = Extract<Overlay, { type: 'file' }>

// The editor pulls in CodeMirror, so keep it out of the initial bundle.
const CodeViewer = lazy(() =>
  import('./code-viewer').then((module) => ({ default: module.CodeViewer })),
)

/** Read-only preview of a file, overlaid on the terminal. */
export function FilePreview({ overlay }: { overlay: FileOverlay }) {
  const { path, content: file } = overlay

  return (
    <OverlayShell
      header={
        <>
          <span className={styles.path}>{path}</span>
          <span className={styles.readonly}>read-only</span>
        </>
      }
    >
      <div className={styles.body}>
        {!file ? (
          <span className={styles.message}>Loading…</span>
        ) : file.binary ? (
          <span className={styles.message}>Binary file — not shown.</span>
        ) : (
          <Suspense fallback={<span className={styles.message}>Loading…</span>}>
            <CodeViewer value={file.content} path={path} />
          </Suspense>
        )}
        {file?.truncated && <div className={styles.truncated}>… truncated (large file)</div>}
      </div>
    </OverlayShell>
  )
}
