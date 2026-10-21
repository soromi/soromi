//Packages
import { cn } from '@soromi/ui'

/** Where the texture is strongest, and the glow sits: the top of the page, or its middle. */
type Focus = 'top' | 'center'

/** Where the dots show, fading out gradually toward nothing; outside it there are none. */
const MASK: Record<Focus, string> = {
  top: 'radial-gradient(ellipse 65% 70% at 50% 0%, rgb(0 0 0 / 85%) 0%, rgb(0 0 0 / 45%) 35%, rgb(0 0 0 / 12%) 60%, transparent 80%)',
  center:
    'radial-gradient(ellipse 50% 55% at 50% 50%, rgb(0 0 0 / 85%) 0%, rgb(0 0 0 / 45%) 35%, rgb(0 0 0 / 12%) 60%, transparent 85%)',
}

/** The glow: a gradient rather than a blurred shape, so it has no edge to see. */
const GLOW: Record<Focus, string> = {
  top: 'radial-gradient(ellipse 45% 40% at 50% 0%, color-mix(in srgb, var(--soromi-accent) 10%, transparent) 0%, transparent 100%)',
  center:
    'radial-gradient(ellipse 35% 35% at 50% 50%, color-mix(in srgb, var(--soromi-accent) 8%, transparent) 0%, transparent 100%)',
}

/**
 * The dotted texture as the ground of a whole page, not a box on it: dots across all of it that
 * fade out softly in every direction from where the page's content is (`focus`), and a faint glow
 * of the accent there. Behind the content, which brings its own surfaces; it never takes a click.
 */
export function Ambient({ focus = 'top', className }: { focus?: Focus; className?: string }) {
  return (
    <div
      aria-hidden="true"
      className={cn('pointer-events-none absolute inset-0 overflow-hidden', className)}
    >
      <div className="absolute inset-0" style={{ background: GLOW[focus] }} />
      <div
        className="absolute inset-0 bg-[radial-gradient(circle,var(--soromi-border-strong)_1px,transparent_1.2px)] [background-size:16px_16px]"
        style={{ maskImage: MASK[focus], WebkitMaskImage: MASK[focus] }}
      />
    </div>
  )
}
