//Store
import { useUiStore } from '@/stores/ui-store'

//Styles
import styles from './overlay-shell.module.css'

//Types
import type { ReactNode } from 'react'

/**
 * Full-cover chrome for an overlay screen: positioning, background, a header (title, with optional
 * extra content) and a close button that pops the top overlay. Screens render only their body, so
 * every overlay looks the same (mirrors the desktop app's OverlayShell).
 */
export function OverlayShell({
  title,
  extra,
  children,
}: {
  title?: ReactNode
  extra?: ReactNode
  children: ReactNode
}) {
  const popOverlay = useUiStore((s) => s.popOverlay)

  return (
    <div className={styles.overlay}>
      <div className={styles.header}>
        {title && <span className={styles.title}>{title}</span>}
        {extra}
        <span className={styles.spacer} />
        <button type="button" className={styles.close} onClick={popOverlay} title="Close">
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M18 6L6 18M6 6l12 12" />
          </svg>
        </button>
      </div>
      {children}
    </div>
  )
}
