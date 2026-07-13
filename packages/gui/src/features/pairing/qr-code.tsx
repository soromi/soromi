import { encodeQR } from '@paulmillr/qr'
import { useMemo } from 'react'

//Styles
import styles from './qr-code.module.css'

/** A quiet zone (in modules) around the code, needed for scanners to lock on. */
const MARGIN = 3

/** Renders a value as a scannable QR code (dark modules on white), self-contained SVG. */
export function QrCode({ value, size = 240 }: { value: string; size?: number }) {
  const matrix = useMemo(() => encodeQR(value, 'raw'), [value])

  const count = matrix.length
  const total = count + MARGIN * 2

  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${total} ${total}`}
      className={styles.qr}
      role="img"
      aria-label="Pairing QR code"
    >
      <rect width={total} height={total} fill="#ffffff" />
      {matrix.map((row, r) =>
        row.map((dark, c) =>
          dark ? (
            <rect
              // biome-ignore lint/suspicious/noArrayIndexKey: a fixed grid, index is the identity.
              key={`${r}-${c}`}
              x={c + MARGIN}
              y={r + MARGIN}
              width={1}
              height={1}
              fill="#0a0a0b"
            />
          ) : null,
        ),
      )}
    </svg>
  )
}
