//Utils
import { cn } from './lib/utils'

//Types
import type { HTMLAttributes } from 'react'

/**
 * A grip affordance for drag-to-reorder. Spread a `useReorder().dragHandle(id)` onto it to make it
 * draggable; it renders a six-dot grip and faint-until-hover styling.
 */
export function DragHandle({ className, ...props }: HTMLAttributes<HTMLSpanElement>) {
  return (
    <span
      className={cn(
        'inline-flex w-4 flex-none cursor-grab items-center justify-center text-[var(--soromi-text-faint)] transition-colors duration-[120ms] hover:text-[var(--soromi-text-dim)] active:cursor-grabbing',
        className,
      )}
      {...props}
    >
      <svg width="10" height="16" viewBox="0 0 10 16" fill="currentColor" aria-hidden="true">
        <circle cx="2.5" cy="4" r="1.3" />
        <circle cx="7.5" cy="4" r="1.3" />
        <circle cx="2.5" cy="8" r="1.3" />
        <circle cx="7.5" cy="8" r="1.3" />
        <circle cx="2.5" cy="12" r="1.3" />
        <circle cx="7.5" cy="12" r="1.3" />
      </svg>
    </span>
  )
}
