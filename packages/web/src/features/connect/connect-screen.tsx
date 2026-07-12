import { useState } from 'react'

//Store
import { useUiStore } from '@/stores/ui-store'

//Styles
import styles from './connect-screen.module.css'

/**
 * Placeholder pairing screen: shown before a device is connected. Visuals only, no relay,
 * pairing, or crypto yet. "Connect" flips the mock paired flag so the session UI can be seen.
 */
export function ConnectScreen() {
  const setPaired = useUiStore((s) => s.setPaired)
  const [code, setCode] = useState('')

  return (
    <div className={styles.screen}>
      <div className={styles.brand}>
        <div className={styles.logo}>S</div>
        <div className={styles.title}>Soromi</div>
        <div className={styles.subtitle}>Remote control for your coding agents</div>
      </div>

      <div className={styles.card}>
        <div className={styles.cardTitle}>Connect to your Mac</div>

        <button type="button" className={styles.qr} aria-label="Scan QR code">
          <span className={styles.qrGlyph}>▣</span>
          <span className={styles.qrLabel}>Scan the QR code shown in the desktop app</span>
        </button>

        <div className={styles.or}>
          <span>or enter the pairing code</span>
        </div>

        <input
          className={styles.code}
          placeholder="0000-0000"
          inputMode="numeric"
          autoComplete="one-time-code"
          value={code}
          onChange={(event) => setCode(event.currentTarget.value)}
        />

        <button type="button" className={styles.connect} onClick={() => setPaired(true)}>
          Connect
        </button>
      </div>

      <div className={styles.hint}>Open Soromi on your Mac, then Connect a phone.</div>
    </div>
  )
}
