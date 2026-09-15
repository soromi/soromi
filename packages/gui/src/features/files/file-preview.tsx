import { Suspense, lazy, useState } from 'react'

//Packages
import { useTransport } from '@soromi/client'
import { cn } from '@soromi/ui'

//Store
import { useAppStore } from '@/stores/app-store'

//Types
import type { Overlay } from '@/stores/app-store'

type FileOverlay = Extract<Overlay, { type: 'file' }>

// The editor pulls in CodeMirror, so keep it out of the initial bundle. Shared with the web app.
const CodeViewer = lazy(() =>
  import('@soromi/ui/code-viewer').then((module) => ({ default: module.CodeViewer })),
)

/**
 * A file docked on the right of the workspace content. It opens **narrow** — a panel beside the
 * chat, so you can read the file and keep talking — and expands **wide** to cover the chat entirely
 * (the workspaces sidebar always stays, since this is a content-scope overlay). The header leads
 * with a back button (pops the overlay), then the file name, and ends with the expand toggle; the
 * full path sits on a thin subline. Editable (⌘S save) unless the file is binary or truncated.
 */
export function FilePreview({ overlay }: { overlay: FileOverlay }) {
  const { workspace, path, content: file } = overlay
  const transport = useTransport()
  const setFileContent = useAppStore((s) => s.setFileContent)
  const popOverlay = useAppStore((s) => s.popOverlay)
  const [wide, setWide] = useState(false)

  const fileName = path.split('/').pop() || path

  // A truncated file only holds its head, so saving would drop the rest — keep those read-only.
  const editable = Boolean(file) && !file?.binary && !file?.truncated
  const save = editable
    ? (content: string) => {
        transport.send({ type: 'write-file', workspace, path, content })
        // Optimistic: treat the buffer as the saved baseline so the editor clears "unsaved". A
        // failed write comes back as an `Error` message.
        setFileContent(workspace, path, { content, truncated: false, binary: false })
      }
    : undefined

  return (
    // The root doesn't take clicks, so the chat stays interactive on the left in narrow mode; only
    // the docked panel does.
    <div className="pointer-events-none absolute inset-0 z-[var(--z-overlay)] flex justify-end">
      <div
        className={cn(
          'pointer-events-auto flex h-full flex-col border-[var(--soromi-border-subtle)] border-l bg-[var(--soromi-bg-terminal)] shadow-[-10px_0_30px_rgb(0_0_0/28%)] transition-[width] duration-200 ease-out',
          wide ? 'w-full' : 'w-[62%] min-w-[440px] max-w-[960px]',
        )}
      >
        <div
          data-drag-region
          className="flex h-[41px] flex-none items-center gap-2 border-[var(--soromi-border-subtle)] border-b pr-2 pl-1.5"
        >
          <button
            type="button"
            onClick={popOverlay}
            title="Close"
            className="inline-flex h-[30px] w-[30px] flex-none cursor-pointer appearance-none items-center justify-center rounded-lg border-none bg-transparent text-[var(--soromi-text-faint)] transition-colors hover:bg-[var(--soromi-bg-hover)] hover:text-[var(--soromi-text)]"
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
          <button
            type="button"
            onClick={() => setWide((w) => !w)}
            title={wide ? 'Collapse' : 'Expand'}
            className="inline-flex h-[30px] w-[30px] flex-none cursor-pointer appearance-none items-center justify-center rounded-lg border-none bg-transparent text-[var(--soromi-text-faint)] transition-colors hover:bg-[var(--soromi-bg-hover)] hover:text-[var(--soromi-text)]"
          >
            {wide ? (
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="M13 6l6 6-6 6M6 6l6 6-6 6" />
              </svg>
            ) : (
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="M11 6l-6 6 6 6M18 6l-6 6 6 6" />
              </svg>
            )}
          </button>
          <span className="ml-1 min-w-0 overflow-hidden text-ellipsis whitespace-nowrap font-medium text-[13px] text-[var(--soromi-text)] [font-family:var(--soromi-font-mono)]">
            {fileName}
          </span>
          <span className="flex-1" />
          {!editable && (
            <span className="flex-none text-[11px] text-[var(--soromi-text-faint)]">read-only</span>
          )}
        </div>
        <div className="flex h-[26px] flex-none items-center overflow-hidden border-[var(--soromi-border-subtle)] border-b px-3">
          <span className="min-w-0 overflow-hidden text-ellipsis whitespace-nowrap text-[11px] text-[var(--soromi-text-faint)] [font-family:var(--soromi-font-mono)]">
            {path}
          </span>
        </div>
        <div className="flex min-h-0 flex-1 flex-col">
          {!file ? (
            <span className="p-3 text-[var(--soromi-text-faint)]">Loading…</span>
          ) : file.binary ? (
            <span className="p-3 text-[var(--soromi-text-faint)]">Binary file — not shown.</span>
          ) : (
            <Suspense
              fallback={<span className="p-3 text-[var(--soromi-text-faint)]">Loading…</span>}
            >
              <CodeViewer value={file.content} path={path} onSave={save} />
            </Suspense>
          )}
          {file?.truncated && (
            <div className="px-3 py-2 text-[var(--soromi-text-faint)]">
              … truncated (large file)
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
