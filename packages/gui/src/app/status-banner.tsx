import clsx from 'clsx'
import { useShallow } from 'zustand/react/shallow'

//Packages
import { useClientStore } from '@soromi/client'

//Store
import { useAppStore } from '@/stores/app-store'

//Styles
import styles from './status-banner.module.css'

/** A slim strip above the workspace: daemon-connection status and dismissible account notices. */
export function StatusBanner() {
  const connected = useClientStore((s) => s.connected)
  const { notice, setNotice } = useAppStore(
    useShallow((s) => ({ notice: s.notice, setNotice: s.setNotice })),
  )

  if (!connected) {
    return <div className={clsx(styles.banner, styles.warn)}>Connecting to the daemon…</div>
  }
  if (notice) {
    return (
      <div className={clsx(styles.banner, styles.notice)}>
        <span className={styles.text}>{notice}</span>
        <button
          type="button"
          className={styles.dismiss}
          onClick={() => setNotice(null)}
          aria-label="Dismiss"
        >
          ✕
        </button>
      </div>
    )
  }
  return null
}
