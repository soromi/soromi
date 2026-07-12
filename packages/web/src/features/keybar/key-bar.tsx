//Packages
import { useTransport } from '@soromi/client'

//Styles
import styles from './key-bar.module.css'

/** A key: its face and the bytes it sends to the PTY. `wide` keys take more room (arrows are 1). */
interface Key {
  label: string
  bytes: string
}

// The keys a phone keyboard lacks or makes awkward, sent straight to the agent's terminal.
const KEYS: Key[] = [
  { label: 'esc', bytes: '\x1b' },
  { label: 'tab', bytes: '\t' },
  { label: '⌃C', bytes: '\x03' },
  { label: '|', bytes: '|' },
  { label: '~', bytes: '~' },
  { label: '/', bytes: '/' },
  { label: '-', bytes: '-' },
  { label: '←', bytes: '\x1b[D' },
  { label: '↑', bytes: '\x1b[A' },
  { label: '↓', bytes: '\x1b[B' },
  { label: '→', bytes: '\x1b[C' },
]

/** The special-keys row above the on-screen keyboard. Sends raw bytes to the active session. */
export function KeyBar({ session }: { session?: string }) {
  const transport = useTransport()
  const press = (bytes: string) => {
    if (session) transport.send({ type: 'input', session, data: bytes })
  }

  return (
    <div className={styles.bar}>
      <div className={styles.keys}>
        {KEYS.map((key) => (
          <button
            key={key.label}
            type="button"
            className={styles.key}
            disabled={!session}
            onClick={() => press(key.bytes)}
          >
            {key.label}
          </button>
        ))}
      </div>
    </div>
  )
}
