//Packages
import { cn } from '@soromi/ui'

//Types
import type { ReactNode } from 'react'

/**
 * One page of Settings: its title and what it is for, an action at the right (adding one, say),
 * then its groups. Compact, as a desktop's settings are: small type, rows rather than cards.
 */
export function SettingsPage({
  title,
  description,
  action,
  children,
}: {
  title: string
  description?: ReactNode
  action?: ReactNode
  children: ReactNode
}) {
  return (
    <section className="flex flex-col gap-7">
      <header className="flex items-end justify-between gap-6">
        <div className="min-w-0">
          <h2 className="m-0 font-semibold text-[20px] text-[var(--soromi-text)] tracking-[-0.01em]">
            {title}
          </h2>
          {description && (
            <p className="m-0 mt-1 text-[13px] text-[var(--soromi-text-faint)] leading-[1.5]">
              {description}
            </p>
          )}
        </div>
        {action && <div className="flex flex-none items-center gap-2">{action}</div>}
      </header>
      {children}
    </section>
  )
}

/**
 * A group of settings: a small label, its rows together on one card with a hairline between them,
 * and a line under it on what they do.
 */
export function SettingsGroup({
  label,
  hint,
  action,
  children,
}: {
  label?: string
  hint?: ReactNode
  action?: ReactNode
  children: ReactNode
}) {
  return (
    <div className="flex flex-col gap-2">
      {(label || action) && (
        <div className="flex items-center justify-between gap-3 px-1">
          {label && (
            <span className="font-semibold text-[11px] text-[var(--soromi-text-faint)] uppercase tracking-[0.08em]">
              {label}
            </span>
          )}
          {action}
        </div>
      )}
      <div className="flex flex-col divide-y divide-[var(--soromi-border-subtle)] overflow-hidden rounded-[10px] border border-[var(--soromi-border)]">
        {children}
      </div>
      {hint && (
        <p className="m-0 px-1 text-[12px] text-[var(--soromi-text-faint)] leading-[1.5]">{hint}</p>
      )}
    </div>
  )
}

/** One row of a group: what it is on the left, with a line on it, and its control on the right. */
export function SettingsRow({
  title,
  description,
  control,
  className,
  children,
}: {
  title: ReactNode
  description?: ReactNode
  control?: ReactNode
  className?: string
  children?: ReactNode
}) {
  return (
    <div className={cn('flex min-h-[52px] items-center gap-6 px-4 py-3', className)}>
      <div className="min-w-0 flex-1">
        <div className="text-[13px] text-[var(--soromi-text)]">{title}</div>
        {description && (
          <div className="mt-0.5 text-[12px] text-[var(--soromi-text-faint)] leading-[1.45]">
            {description}
          </div>
        )}
        {children}
      </div>
      {control && <div className="flex flex-none items-center gap-2">{control}</div>}
    </div>
  )
}

/** A small, quiet button for a page's or a group's action. */
export const SETTINGS_BUTTON =
  'inline-flex h-8 cursor-pointer appearance-none items-center gap-1.5 rounded-[8px] border border-[var(--soromi-border)] bg-transparent px-3 font-medium text-[12.5px] text-[var(--soromi-text-dim)] transition-colors hover:bg-[var(--soromi-bg-hover)] hover:text-[var(--soromi-text)] disabled:cursor-default disabled:opacity-50 disabled:hover:bg-transparent'

/** The same, in the accent: the one thing a page asks for. */
export const SETTINGS_PRIMARY =
  'inline-flex h-8 cursor-pointer appearance-none items-center gap-1.5 rounded-[8px] border-none bg-[var(--soromi-accent)] px-3 font-semibold text-[12.5px] text-[var(--soromi-accent-on)] transition-colors hover:bg-[var(--soromi-accent-hover)] disabled:cursor-default disabled:opacity-50'

/** An icon-only button inside a row. */
export const SETTINGS_ICON =
  'inline-flex h-7 w-7 cursor-pointer appearance-none items-center justify-center rounded-[7px] border-none bg-transparent text-[var(--soromi-text-faint)] transition-colors hover:bg-[var(--soromi-bg-hover)] hover:text-[var(--soromi-text)]'

/** A text box that sits in a row. */
export const SETTINGS_FIELD =
  'h-8 w-[300px] rounded-[8px] border border-[var(--soromi-border)] bg-[var(--soromi-bg-field)] px-2.5 text-[12.5px] text-[var(--soromi-text)] outline-none transition-colors placeholder:text-[var(--soromi-text-ghost)] focus:border-[var(--soromi-accent)] [font-family:var(--soromi-font-mono)]'
