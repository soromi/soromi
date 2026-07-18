//Packages
import { useClientStore, useTransport } from '@soromi/client'

//Styles
import styles from './disconnected.module.css'

/**
 * Covers the whole app when the link to the daemon drops (rendered at the app root), so a
 * disconnected viewport shows this instead of an empty, unusable shell. The transport reconnects on
 * its own; the button just kicks it immediately. Renders nothing while connected.
 */
export function Disconnected() {
  const transport = useTransport()
  const connected = useClientStore((s) => s.connected)

  if (connected) return null

  return (
    <div className={styles.cover}>
      <div className={styles.card}>
        <div className={styles.glyph}>
          <svg
            width="30"
            height="30"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M4 17l6-6-6-6M12 19h8" />
          </svg>
          <span className={styles.badge}>
            <span className={styles.badgeDot} />
          </span>
        </div>
        <div>
          <div className={styles.title}>Disconnected</div>
          <div className={styles.desc}>
            Lost connection to your machine. Reconnect to resume this session.
          </div>
        </div>
        <button type="button" className={styles.button} onClick={() => transport.connect()}>
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M21 12a9 9 0 1 1-3-6.7M21 4v5h-5" />
          </svg>
          Reconnect
        </button>
      </div>
    </div>
  )
}
