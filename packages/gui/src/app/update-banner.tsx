import { useShallow } from 'zustand/react/shallow'

//Packages
import { useClientStore } from '@soromi/client'

//Utils
import { openExternal } from '@/lib/host'

//Styles
import styles from './update-banner.module.css'

/** A slim strip announcing a newer release. Notify-only: "Download" opens the release page. */
export function UpdateBanner() {
  const { update, dismissedUpdate, dismissUpdate } = useClientStore(
    useShallow((s) => ({
      update: s.update,
      dismissedUpdate: s.dismissedUpdate,
      dismissUpdate: s.dismissUpdate,
    })),
  )

  if (!update || update.version === dismissedUpdate) return null

  return (
    <div className={styles.banner}>
      <span className={styles.text}>
        Soromi <strong>{update.version}</strong> is available.
      </span>
      <button type="button" className={styles.download} onClick={() => openExternal(update.url)}>
        Download
      </button>
      <button type="button" className={styles.dismiss} onClick={dismissUpdate} aria-label="Dismiss">
        ✕
      </button>
    </div>
  )
}
