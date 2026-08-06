/**
 * The Soromi logo (three rounded bars) as the chat's live "working" indicator: each bar pulses its
 * opacity in a staggered fade (see the `.soromi-bar*` rules in the theme). Our own animation — no
 * third-party orb — so the brand mark itself signals activity.
 */
export function WorkingMark({ size = 11 }: { size?: number }) {
  return (
    <svg
      viewBox="0 0 57 56"
      width={size}
      height={size}
      className="flex-none"
      fill="var(--soromi-accent)"
      aria-hidden="true"
    >
      <path
        className="soromi-bar"
        d="M44.796,6.605c0,3.645 -2.959,6.605 -6.605,6.605l-31.587,0c-3.645,0 -6.605,-2.959 -6.605,-6.605c0,-3.645 2.959,-6.605 6.605,-6.605l31.587,0c3.645,0 6.605,2.959 6.605,6.605Z"
      />
      <path
        className="soromi-bar soromi-bar-2"
        d="M30.582,27.854c0,3.645 -2.959,6.605 -6.605,6.605l-17.373,0c-3.645,0 -6.605,-2.959 -6.605,-6.605c0,-3.645 2.959,-6.605 6.605,-6.605l17.373,0c3.645,0 6.605,2.959 6.605,6.605Z"
      />
      <path
        className="soromi-bar soromi-bar-3"
        d="M57,49.103c0,3.645 -2.959,6.605 -6.605,6.605l-43.791,0c-3.645,0 -6.605,-2.959 -6.605,-6.605c0,-3.645 2.959,-6.605 6.605,-6.605l43.791,0c3.645,0 6.605,2.959 6.605,6.605Z"
      />
    </svg>
  )
}
