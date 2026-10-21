import { fileType } from '@soromi/core'

//Types
import type { FileKind } from '@soromi/core'
import type { ReactNode } from 'react'

const GLYPH: Record<FileKind, ReactNode> = {
  code: (
    <>
      <path d="M9 8.5 5.5 12 9 15.5" />
      <path d="M15 8.5 18.5 12 15 15.5" />
    </>
  ),
  doc: (
    <>
      <path d="M13 3H7a1 1 0 0 0-1 1v16a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1V8z" />
      <path d="M13 3v5h5" />
      <path d="M9.5 13h5M9.5 16h5" />
    </>
  ),
  image: (
    <>
      <rect x="4" y="5" width="16" height="14" rx="2" />
      <circle cx="9" cy="10" r="1.6" />
      <path d="M5 17l4-3.5 3 2.5 3.5-3L20 16.5" />
    </>
  ),
  lock: (
    <>
      <rect x="5" y="10.5" width="14" height="9.5" rx="2" />
      <path d="M8 10.5V7a4 4 0 0 1 8 0v3.5" />
    </>
  ),
  page: (
    <>
      <path d="M13 3H7a1 1 0 0 0-1 1v16a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1V8z" />
      <path d="M13 3v5h5" />
    </>
  ),
}

/** A file-type icon, chosen from the filename (extension, or a few exact names). */
export function FileIcon({ name, size = 15 }: { name: string; size?: number }) {
  const { kind, color } = fileType(name)

  return (
    <svg
      className="block flex-none"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {GLYPH[kind]}
    </svg>
  )
}

/** A folder icon for directory rows (the chevron already shows open/closed). */
export function FolderIcon({ size = 15 }: { size?: number }) {
  return (
    <svg
      className="block flex-none"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="var(--soromi-text-dim)"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
    </svg>
  )
}
