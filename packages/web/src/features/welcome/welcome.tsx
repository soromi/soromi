//Styles
import styles from './welcome.module.css'

/**
 * Shown when connected to the machine but there are no workspaces to drive yet. Workspaces are
 * created on the host (the desktop app), so this points there rather than offering to create one.
 */
export function Welcome() {
  return (
    <div className={styles.screen}>
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
        </div>
        <div>
          <div className={styles.title}>Connected</div>
          <div className={styles.desc}>
            No workspaces yet. Open one in the Soromi app on your machine and it will show up here.
          </div>
        </div>
      </div>
    </div>
  )
}
