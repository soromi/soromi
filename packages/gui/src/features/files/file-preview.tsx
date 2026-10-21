import { Suspense, lazy } from 'react'

//Packages
import { useTransport } from '@soromi/client'

//Store
import { useAppStore } from '@/stores/app-store'

//Components
import { DockedPanel } from './docked-panel'

//Types
import type { Overlay } from '@/stores/app-store'

type FileOverlay = Extract<Overlay, { type: 'file' }>

// The editor pulls in CodeMirror, so keep it out of the initial bundle.
const CodeViewer = lazy(() =>
  import('@soromi/ui/code-viewer').then((module) => ({ default: module.CodeViewer })),
)

/**
 * A file docked on the right of the workspace content (see `DockedPanel`). Editable (⌘S save) unless
 * the file is binary or truncated.
 */
export function FilePreview({ overlay }: { overlay: FileOverlay }) {
  const { workspace, path, content: file } = overlay
  const transport = useTransport()
  const setFileContent = useAppStore((s) => s.setFileContent)

  const fileName = path.split('/').pop() || path

  // A truncated file only holds its head, so saving would drop the rest — keep those read-only. A
  // picture is shown, not edited.
  const editable = Boolean(file) && !file?.binary && !file?.truncated && !file?.image
  const save = editable
    ? (content: string) => {
        transport.send({ type: 'write-file', workspace, path, content })
        // Optimistic: treat the buffer as the saved baseline so the editor clears "unsaved". A
        // failed write comes back as an `Error` message.
        setFileContent(workspace, path, { content, truncated: false, binary: false })
      }
    : undefined

  return (
    <DockedPanel
      name={fileName}
      subtitle={path}
      extra={
        editable ? undefined : (
          <span className="flex-none text-[11px] text-[var(--soromi-text-faint)]">read-only</span>
        )
      }
    >
      {!file ? (
        <span className="p-3 text-[var(--soromi-text-faint)]">Loading…</span>
      ) : file.image ? (
        file.truncated ? (
          <span className="p-3 text-[var(--soromi-text-faint)]">
            Too large to show here. Open it on the computer.
          </span>
        ) : (
          // Checkered behind it, so a picture with see-through parts reads as such.
          <div className="flex min-h-0 flex-1 items-center justify-center overflow-auto bg-[conic-gradient(var(--soromi-bg-hover)_25%,transparent_0_50%,var(--soromi-bg-hover)_0_75%,transparent_0)] bg-[length:16px_16px] p-4">
            <img
              src={`data:${file.image};base64,${file.content}`}
              alt={fileName}
              className="max-h-full max-w-full object-contain"
            />
          </div>
        )
      ) : file.binary ? (
        <span className="p-3 text-[var(--soromi-text-faint)]">Binary file — not shown.</span>
      ) : (
        <Suspense fallback={<span className="p-3 text-[var(--soromi-text-faint)]">Loading…</span>}>
          <CodeViewer value={file.content} path={path} onSave={save} />
        </Suspense>
      )}
      {file?.truncated && !file.image && (
        <div className="px-3 py-2 text-[var(--soromi-text-faint)]">… truncated (large file)</div>
      )}
    </DockedPanel>
  )
}
