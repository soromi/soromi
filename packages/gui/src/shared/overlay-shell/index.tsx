//Store
import { useAppStore } from '@/stores/app-store'

//Icons
import CloseSvg from '@/assets/icons/close.svg?react'

//Types
import type { ReactNode } from 'react'

/**
 * Full-cover chrome for an overlay screen: positioning, background, a header (icon + title, with
 * optional extra content) and a close button that pops the top overlay. Screens render only their
 * body. The header is shared so every overlay looks the same.
 */
export function OverlayShell({
  icon,
  title,
  extra,
  children,
}: {
  icon?: ReactNode
  title?: ReactNode
  extra?: ReactNode
  children: ReactNode
}) {
  const popOverlay = useAppStore((s) => s.popOverlay)
  return (
    <div className="absolute inset-0 z-[var(--z-overlay)] flex flex-col bg-[var(--soromi-bg-app)]">
      <div className="flex h-[60px] flex-shrink-0 items-center gap-3 border-[var(--soromi-border)] border-b bg-[var(--soromi-bg-app)] px-6">
        {icon && (
          <span className="inline-flex items-center text-[var(--soromi-text-faint)]">{icon}</span>
        )}
        {title && (
          <span className="min-w-0 overflow-hidden text-ellipsis whitespace-nowrap font-semibold text-[17px] text-[var(--soromi-text)]">
            {title}
          </span>
        )}
        {extra}
        <span className="flex-1" />
        <button
          type="button"
          className="inline-flex h-8 w-8 cursor-pointer appearance-none items-center justify-center rounded-lg border-none bg-transparent text-[var(--soromi-text-faint)] transition-colors hover:bg-[var(--soromi-bg-hover)] hover:text-[var(--soromi-text)]"
          onClick={popOverlay}
          title="Close"
        >
          <CloseSvg width={18} height={18} />
        </button>
      </div>
      {children}
    </div>
  )
}
