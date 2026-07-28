//Store
import { useUiStore } from '@/stores/ui-store'

//Types
import type { ReactNode } from 'react'

/**
 * Full-cover chrome for an overlay screen: positioning, background, a header (title, with optional
 * extra content) and a close button that pops the top overlay. Screens render only their body, so
 * every overlay looks the same (mirrors the desktop app's OverlayShell).
 */
export function OverlayShell({
  title,
  extra,
  children,
}: {
  title?: ReactNode
  extra?: ReactNode
  children: ReactNode
}) {
  const popOverlay = useUiStore((s) => s.popOverlay)

  return (
    <div className="absolute inset-0 z-40 flex flex-col bg-[var(--soromi-bg-app)]">
      <div className="flex h-[52px] flex-shrink-0 items-center gap-3 border-[var(--soromi-border)] border-b bg-[var(--soromi-bg-app)] px-4">
        {title && (
          <span className="min-w-0 overflow-hidden text-ellipsis whitespace-nowrap font-semibold text-[var(--soromi-text)] text-sm [font-family:var(--soromi-font-mono)]">
            {title}
          </span>
        )}
        {extra}
        <span className="flex-1" />
        <button
          type="button"
          className="inline-flex h-[34px] w-[34px] cursor-pointer appearance-none items-center justify-center rounded-lg border-none bg-transparent text-[var(--soromi-text-faint)] transition-colors hover:bg-[var(--soromi-bg-hover)] hover:text-[var(--soromi-text)]"
          onClick={popOverlay}
          title="Close"
        >
          <svg
            width="18"
            height="18"
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
      </div>
      {children}
    </div>
  )
}
