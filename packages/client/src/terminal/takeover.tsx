//Transport
import { useTransport } from '../transport/transport-context'

//Store
import { useClientStore } from '../store/client-store'

//Styles
import styles from './takeover.module.css'

/**
 * Shown above the sessions while another device is driving them. Only one viewport controls the
 * terminals at a time (it owns input and size); the rest keep watching, read-only, and can take
 * over from here. Renders nothing when this viewport is the controller. Styled with the app's CSS
 * variables.
 */
export function TakeoverBar() {
  const transport = useTransport()
  const holder = useClientStore((s) => s.controlHolder)

  if (holder === null) return null

  return (
    <div className={styles.bar} role="status">
      <span className={styles.dot} aria-hidden="true" />
      <span className={styles.text}>
        Controlled from <span className={styles.device}>{holder}</span>. You are watching,
        read-only.
      </span>
      <button
        type="button"
        className={styles.button}
        title="The other device switches to watching"
        onClick={() => transport.send({ type: 'take-control' })}
      >
        Take over here
      </button>
    </div>
  )
}
