//Store
import { useAppStore } from '@/stores/app-store'

//Styles
import styles from './overlay-shell.module.css'

//Types
import type { ReactNode } from 'react'

/**
 * Full-cover chrome for an overlay screen: positioning, background, a header (with optional
 * left content) and a close button that pops the top overlay. Screens render only their body.
 */
export function OverlayShell({ header, children }: { header?: ReactNode; children: ReactNode }) {
  const popOverlay = useAppStore((s) => s.popOverlay)
  return (
    <div className={styles.overlay}>
      <div className={styles.header}>
        {header}
        <span className={styles.spacer} />
        <button type="button" className={styles.close} onClick={popOverlay} title="Close">
          ×
        </button>
      </div>
      {children}
    </div>
  )
}
