/** The Soromi brand mark: three emerald rounded bars, drawn bare (no chip). */
export function SoromiMark({ width = 15, height = 14 }: { width?: number; height?: number }) {
  return (
    <svg width={width} height={height} viewBox="0 0 22 20" fill="#3ecf8e" aria-hidden="true">
      <rect x="0" y="1" width="22" height="4.4" rx="2.2" />
      <rect x="0" y="7.8" width="14" height="4.4" rx="2.2" />
      <rect x="0" y="14.6" width="18" height="4.4" rx="2.2" />
    </svg>
  )
}
