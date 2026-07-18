import { useState } from 'react'

//Utils
import { pairingUrl, parsePairingLink } from '@/config/transport'

//Styles
import styles from './connect-screen.module.css'

/**
 * Pairing screen: shown when the app is opened without relay config in the URL. Scanning the QR in
 * the desktop app opens the app already paired (its link carries `?relay&room&key`); this screen is
 * the fallback for pasting that link by hand.
 */
export function ConnectScreen() {
  const [link, setLink] = useState('')
  const [error, setError] = useState(false)

  const connect = () => {
    const config = parsePairingLink(link)
    if (!config) {
      setError(true)
      return
    }

    // Navigate to the pairing URL so the app reloads and dials the real relay transport.
    window.location.href = pairingUrl(config)
  }

  return (
    <div className={styles.screen}>
      <div className={styles.brand}>
        <div className={styles.logo}>
          <svg width="34" height="33" viewBox="0 0 57 56" fill="#2fae6a" aria-hidden="true">
            <path d="M44.796,6.605c0,3.645 -2.959,6.605 -6.605,6.605l-31.587,0c-3.645,0 -6.605,-2.959 -6.605,-6.605c0,-3.645 2.959,-6.605 6.605,-6.605l31.587,0c3.645,0 6.605,2.959 6.605,6.605Z" />
            <path d="M30.582,27.854c0,3.645 -2.959,6.605 -6.605,6.605l-17.373,0c-3.645,0 -6.605,-2.959 -6.605,-6.605c0,-3.645 2.959,-6.605 6.605,-6.605l17.373,0c3.645,0 6.605,2.959 6.605,6.605Z" />
            <path d="M57,49.103c0,3.645 -2.959,6.605 -6.605,6.605l-43.791,0c-3.645,0 -6.605,-2.959 -6.605,-6.605c0,-3.645 2.959,-6.605 6.605,-6.605l43.791,0c3.645,0 6.605,2.959 6.605,6.605Z" />
          </svg>
        </div>
        <div className={styles.title}>Soromi</div>
        <div className={styles.subtitle}>Remote control for your coding agents</div>
      </div>

      <div className={styles.card}>
        <div className={styles.cardTitle}>Connect to your Mac</div>

        <p className={styles.qrLabel}>
          Open Soromi on your Mac, choose <strong>Connect a phone</strong>, and scan the QR code
          with your camera. It opens this app already paired.
        </p>

        <div className={styles.or}>
          <span>or paste the pairing link</span>
        </div>

        <input
          className={styles.code}
          placeholder="https://…?relay=…&room=…&key=…"
          autoComplete="off"
          autoCapitalize="off"
          spellCheck={false}
          value={link}
          onChange={(event) => {
            setLink(event.currentTarget.value)
            setError(false)
          }}
          onKeyDown={(event) => event.key === 'Enter' && connect()}
        />
        {error && <div className={styles.error}>That doesn't look like a pairing link.</div>}

        <button type="button" className={styles.connect} onClick={connect}>
          Connect
        </button>
      </div>
    </div>
  )
}
