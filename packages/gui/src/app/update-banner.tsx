import { openUrl } from '@tauri-apps/plugin-opener'
import { useShallow } from 'zustand/react/shallow'

//Store
import { useAppStore } from '@/stores/app-store'

//Constants
import { isTauri } from '@/config'

//Styles
import styles from './update-banner.module.css'

/** A slim strip announcing a newer release. Notify-only: "Download" opens the release page. */
export function UpdateBanner() {
  const { update, dismissedUpdate, dismissUpdate } = useAppStore(
    useShallow((s) => ({
      update: s.update,
      dismissedUpdate: s.dismissedUpdate,
      dismissUpdate: s.dismissUpdate,
    })),
  )

  if (!update || update.version === dismissedUpdate) return null

  const download = () => {
    if (isTauri) openUrl(update.url)
    else window.open(update.url, '_blank', 'noreferrer')
  }

  return (
    <div className={styles.banner}>
      <span className={styles.text}>
        Soromi <strong>{update.version}</strong> is available.
      </span>
      <button type="button" className={styles.download} onClick={download}>
        Download
      </button>
      <button type="button" className={styles.dismiss} onClick={dismissUpdate} aria-label="Dismiss">
        ✕
      </button>
    </div>
  )
}
