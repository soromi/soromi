import { useState } from 'react'

//Packages
import { cn } from '@soromi/ui'

//Store
import { useAppStore } from '@/stores/app-store'

//Types
import type { ReactNode } from 'react'

/**
 * The right-docked content panel used by the file viewer and the git diff viewer. It opens **narrow**
 * — beside the chat, which stays interactive (the root doesn't take clicks) — and expands **wide** to
 * cover the chat (the workspaces sidebar always stays, since this is a content-scope overlay). The
 * header leads with the actions grouped on the left (close, then expand), then `name`, with optional
 * `extra` on the right; `subtitle` sits on a thin subline below.
 */
export function DockedPanel({
  name,
  subtitle,
  extra,
  children,
}: {
  name: string
  subtitle: string
  extra?: ReactNode
  children: ReactNode
}) {
  const popOverlay = useAppStore((s) => s.popOverlay)
  const [wide, setWide] = useState(false)

  return (
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
            {name}
          </span>
          <span className="flex-1" />
          {extra}
        </div>
        <div className="flex h-[26px] flex-none items-center overflow-hidden border-[var(--soromi-border-subtle)] border-b px-3">
          <span className="min-w-0 overflow-hidden text-ellipsis whitespace-nowrap text-[11px] text-[var(--soromi-text-faint)] [font-family:var(--soromi-font-mono)]">
            {subtitle}
          </span>
        </div>
        <div className="flex min-h-0 flex-1 flex-col">{children}</div>
      </div>
    </div>
  )
}
