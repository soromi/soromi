import { encodeQR } from '@paulmillr/qr'
import { useMemo } from 'react'

/** A quiet zone (in modules) around the code, needed for scanners to lock on. */
const MARGIN = 3

/** How much of the code's width the mark in its middle takes, when it has one. */
const MARK_SHARE = 0.2

/**
 * Renders a value as a scannable QR code (dark modules on white), self-contained SVG: one path for
 * every dark module, so a long code is cheap to draw. With `mark`, the Soromi bars sit in its
 * middle on a white tile; the code is then made with the most error correction, which reads it
 * through the tile.
 */
export function QrCode({
  value,
  size = 240,
  mark = false,
}: {
  value: string
  size?: number
  mark?: boolean
}) {
  const matrix = useMemo(
    () => encodeQR(value, 'raw', { ecc: mark ? 'high' : 'medium' }),
    [value, mark],
  )

  const count = matrix.length
  const total = count + MARGIN * 2
  const modules = useMemo(() => {
    let d = ''
    matrix.forEach((row, r) => {
      row.forEach((dark, c) => {
        if (dark) d += `M${c + MARGIN} ${r + MARGIN}h1v1h-1z`
      })
    })
    return d
  }, [matrix])

  // The tile is a whole number of modules, centred, so it covers modules cleanly.
  const tile = Math.ceil(count * MARK_SHARE) | 1
  const at = MARGIN + (count - tile) / 2

  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${total} ${total}`}
      className="block rounded-xl bg-white"
      role="img"
      aria-label="Pairing QR code"
      shapeRendering="crispEdges"
    >
      <rect width={total} height={total} fill="#ffffff" />
      <path d={modules} fill="#121213" />
      {mark && (
        <g>
          <rect
            x={at - 0.5}
            y={at - 0.5}
            width={tile + 1}
            height={tile + 1}
            rx={tile * 0.22}
            fill="#ffffff"
          />
          <svg
            x={at + tile * 0.18}
            y={at + tile * 0.2}
            width={tile * 0.64}
            height={tile * 0.6}
            viewBox="0 0 22 20"
            shapeRendering="geometricPrecision"
            aria-hidden="true"
          >
            <rect x="0" y="1" width="22" height="4.4" rx="2.2" fill="#3ecf8e" />
            <rect x="0" y="7.8" width="14" height="4.4" rx="2.2" fill="#3ecf8e" />
            <rect x="0" y="14.6" width="18" height="4.4" rx="2.2" fill="#3ecf8e" />
          </svg>
        </g>
      )}
    </svg>
  )
}
