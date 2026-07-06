//Store
import { useAppStore } from '@/stores/app-store'

//Icons
import CloseSvg from '@/assets/icons/close.svg?react'

//Styles
import styles from './overlay-shell.module.css'

//Types
import type { ReactNode } from 'react'

/**
 * Full-cover chrome for an overlay screen: positioning, background, a header (icon + title, with
 * optional extra content) and a close button that pops the top overlay. Screens render only their
 * body. The header is shared so every overlay looks the same.
 */
export function OverlayShell({
  icon,
  title,
  extra,
  children,
}: {
  icon?: ReactNode
  title?: ReactNode
  extra?: ReactNode
  children: ReactNode
}) {
  const popOverlay = useAppStore((s) => s.popOverlay)
  return (
    <div className={styles.overlay}>
      <div className={styles.header}>
        {icon && <span className={styles.icon}>{icon}</span>}
        {title && <span className={styles.title}>{title}</span>}
        {extra}
        <span className={styles.spacer} />
        <button type="button" className={styles.close} onClick={popOverlay} title="Close">
          <CloseSvg width={18} height={18} />
        </button>
      </div>
      {children}
    </div>
  )
}
