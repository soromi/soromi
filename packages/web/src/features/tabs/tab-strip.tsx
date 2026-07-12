import clsx from 'clsx'

//Packages
import type { WorkspaceInfo } from '@soromi/client'

//Store
import { useUiStore } from '@/stores/ui-store'

//Utils
import { statusVariant } from '@/lib/status'

//Styles
import styles from './tab-strip.module.css'

//Types
import type { SessionSummary } from '@soromi/protocol'

/** The active workspace's tabs, horizontally scrollable, plus a new-tab affordance. */
export function TabStrip({ workspace }: { workspace: WorkspaceInfo }) {
  const activeSession = useUiStore((s) => s.activeSession[workspace.name])
  const selectSession = useUiStore((s) => s.selectSession)

  return (
    <div className={styles.strip}>
      <div className={styles.tabs}>
        {workspace.sessions.map((session) => (
          <button
            key={session.id}
            type="button"
            className={clsx(styles.tab, session.id === activeSession && styles.active)}
            onClick={() => selectSession(workspace.name, session.id)}
          >
            <span className={styles.label}>{label(session)}</span>
            {session.status !== 'idle' && (
              <span className={clsx(styles.dot, styles[statusVariant(session.status)])} />
            )}
          </button>
        ))}
      </div>
      <button type="button" className={styles.add} aria-label="New tab">
        +
      </button>
    </div>
  )
}

function label(session: SessionSummary): string {
  return session.title ?? session.account
}
