//Packages
import { cn } from '@soromi/ui'

//Types
import type { ReactNode } from 'react'

/**
 * The grid-and-glow backdrop for a moment worth marking: pairing a phone, a first run, a screen
 * with nothing on it yet. A field of dots that fades out downward, a soft glow of the accent, and
 * a fade at the bottom into `fade`, the surface it sits on, so what is drawn over it runs out
 * instead of being cut off. Decorative only: its content goes on top, centred.
 */
export function Backdrop({
  fade,
  className,
  children,
}: {
  /** The surface underneath, which the bottom edge fades into (a CSS colour). */
  fade: string
  /** Its size and anything else; it is `relative`, so its content can be placed in it. */
  className?: string
  children?: ReactNode
}) {
  return (
    <div className={cn('relative overflow-hidden', className)}>
      <div
        aria-hidden="true"
        className="absolute inset-0 bg-[radial-gradient(circle,var(--soromi-border)_1px,transparent_1.2px)] [background-size:14px_14px] [mask-image:linear-gradient(to_bottom,black_20%,transparent_95%)]"
      />
      <div
        aria-hidden="true"
        className="absolute top-6 left-1/2 h-40 w-64 -translate-x-1/2 rounded-full bg-[color-mix(in_srgb,var(--soromi-accent)_14%,transparent)] blur-3xl"
      />
      {children}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 bottom-0 h-14"
        style={{ background: `linear-gradient(to bottom, transparent, ${fade})` }}
      />
    </div>
  )
}

/** The Soromi mark, or another glyph, on a tile of its own: what sits at the middle of a backdrop. */
export function BackdropTile({
  children,
  size = 'md',
}: {
  children: ReactNode
  size?: 'md' | 'lg'
}) {
  return (
    <div
      className={cn(
        'flex items-center justify-center border border-[var(--soromi-border)] bg-[var(--soromi-bg-sidebar)] [box-shadow:var(--soromi-shadow-popover)]',
        size === 'lg' ? 'h-16 w-16 rounded-[18px]' : 'h-12 w-12 rounded-[14px]',
      )}
    >
      {children}
    </div>
  )
}
