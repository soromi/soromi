//Transport
import { useTransport } from '../transport/transport-context'

//Store
import { useClientStore } from '../store/client-store'

//Styles
import styles from './takeover.module.css'

/**
 * Covers the terminal when another device is driving it. Only one viewport controls the terminals
 * at a time (it owns input + size); the rest show this and can take over. Renders nothing when this
 * viewport is the controller. Styled with the app's CSS variables, so it fits desktop and web.
 */
export function TakeoverScreen() {
  const transport = useTransport()
  const holder = useClientStore((s) => s.controlHolder)

  if (holder === null) return null

  return (
    <div className={styles.cover}>
      <div className={styles.icon} aria-hidden="true">
        <div className={styles.laptopScreen} />
        <div className={styles.laptopBase} />
        <div className={styles.phone}>
          <span className={styles.phoneDot} />
        </div>
      </div>

      <div>
        <div className={styles.title}>Active on another device</div>
        <div className={styles.desc}>
          This session is being controlled from <span className={styles.device}>{holder}</span>.
          Take over to continue here. The other device will switch to view-only.
        </div>
      </div>

      <button
        type="button"
        className={styles.button}
        onClick={() => transport.send({ type: 'take-control' })}
      >
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
          <path d="M17 3l4 4-4 4M21 7H8M7 21l-4-4 4-4M3 17h13" />
        </svg>
        Take over here
      </button>
    </div>
  )
}
