//Packages
import { cn } from '@soromi/ui'

//Store
import { useAppStore } from '@/stores/app-store'

//Utils
import { isMac } from '@/lib/platform'

//Types
import type { ReactNode } from 'react'

/**
 * Chrome for an overlay screen: a thin header led by a **back** button (which pops the overlay),
 * then an icon + title, plus optional `extra` on the right. When a `nav` is provided the body becomes
 * a two-pane layout — the nav sits on the bare shell and the children are wrapped in an inset,
 * rounded, shadowed content panel (Settings / Workspace settings). Without a nav the children fill it.
 */
export function OverlayShell({
  icon,
  title,
  extra,
  nav,
  children,
}: {
  icon?: ReactNode
  title?: ReactNode
  extra?: ReactNode
  nav?: ReactNode
  children: ReactNode
}) {
  const popOverlay = useAppStore((s) => s.popOverlay)
  return (
    <div className="absolute inset-0 z-[var(--z-overlay)] flex flex-col bg-[var(--soromi-bg-shell)]">
      <div
        data-drag-region
        className={cn(
          'flex h-[41px] flex-shrink-0 items-center gap-2.5 pr-3',
          // Clear the macOS traffic lights, like the sidebar's top bar.
          isMac ? 'pl-[76px]' : 'pl-2',
        )}
      >
        <button
          type="button"
          className="inline-flex h-[30px] w-[30px] flex-none cursor-pointer appearance-none items-center justify-center rounded-lg border-none bg-transparent text-[var(--soromi-text-faint)] transition-colors hover:bg-[var(--soromi-bg-hover)] hover:text-[var(--soromi-text)]"
          onClick={popOverlay}
          title="Back"
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
            <path d="M15 5l-7 7 7 7" />
          </svg>
        </button>
        {icon && (
          <span className="inline-flex items-center text-[var(--soromi-text-dim)]">{icon}</span>
        )}
        {title && (
          <span className="min-w-0 overflow-hidden text-ellipsis whitespace-nowrap font-medium text-[15px] text-[var(--soromi-text)]">
            {title}
          </span>
        )}
        <span className="flex-1" />
        {extra}
      </div>
      {nav ? (
        <div className="flex min-h-0 flex-1">
          {nav}
          <div className="mr-2 mb-2 min-w-0 flex-1 overflow-auto rounded-[12px] border border-[var(--soromi-border-subtle)] bg-[var(--soromi-bg-terminal)] shadow-[0_1px_2px_rgb(0_0_0/40%),0_10px_30px_rgb(0_0_0/32%)]">
            {children}
          </div>
        </div>
      ) : (
        children
      )}
    </div>
  )
}

/** The left nav rail shown on the overlay shell (212px), with an uppercase group label. */
export function OverlayNav({ label, children }: { label: string; children: ReactNode }) {
  return (
    <nav className="flex w-[212px] flex-none flex-col gap-[3px] px-3.5 py-5">
      <div className="px-3 pb-2.5 font-semibold text-[11px] text-[var(--soromi-text-faint)] uppercase tracking-[0.1em]">
        {label}
      </div>
      {children}
    </nav>
  )
}

/** One nav item: icon + label, with a selected pill (accent icon) and an optional danger tint. */
export function OverlayNavItem({
  icon,
  label,
  active,
  danger,
  onClick,
}: {
  icon: ReactNode
  label: string
  active: boolean
  danger?: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'flex cursor-pointer appearance-none items-center gap-[11px] rounded-[9px] border-none bg-transparent px-3 py-[9px] text-left font-medium text-[13.5px] transition-colors',
        active
          ? danger
            ? 'bg-[var(--soromi-bg-hover)] text-[#e08585]'
            : 'bg-[var(--soromi-bg-hover)] text-[var(--soromi-text)]'
          : 'text-[var(--soromi-text-faint)] hover:bg-[var(--soromi-bg-hover)] hover:text-[var(--soromi-text-dim)]',
      )}
    >
      <span
        className={cn(
          'inline-flex',
          active
            ? danger
              ? 'text-[#e08585]'
              : 'text-[var(--soromi-accent)]'
            : 'text-[var(--soromi-text-faint)]',
        )}
      >
        {icon}
      </span>
      {label}
    </button>
  )
}
