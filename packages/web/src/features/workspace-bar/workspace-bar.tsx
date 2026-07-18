import clsx from 'clsx'
import { useMemo } from 'react'
import { useShallow } from 'zustand/react/shallow'

//Packages
import { useClientStore } from '@soromi/client'

//Store
import { useUiStore } from '@/stores/ui-store'

//Styles
import styles from './workspace-bar.module.css'

/** Connection state for the status subtitle: which text and tone the bar shows. */
function statusMeta(connected: boolean, holder: string | null): { text: string; tone: string } {
  if (!connected) return { text: 'Disconnected', tone: styles.toneOff }
  if (holder) return { text: `${holder} in control`, tone: styles.toneBusy }

  return { text: 'Connected', tone: styles.toneOk }
}

/**
 * The workspace bar: the phone's persistent chrome, docked at the bottom above the tab bar. Tapping
 * the switcher opens the workspaces sheet; the menu button opens the session settings.
 */
export function WorkspaceBar() {
  const { active, openSheet } = useUiStore(
    useShallow((s) => ({ active: s.active, openSheet: s.openSheet })),
  )
  const { connected, holder } = useClientStore(
    useShallow((s) => ({ connected: s.connected, holder: s.controlHolder })),
  )

  const name = active ?? 'Soromi'
  const meta = useMemo(() => statusMeta(connected, holder), [connected, holder])

  return (
    <div className={styles.bar}>
      <button type="button" className={styles.switcher} onClick={() => openSheet('workspaces')}>
        <span className={styles.avatar}>{name.slice(0, 2)}</span>
        <span className={styles.text}>
          <span className={styles.nameRow}>
            <span className={styles.name}>{name}</span>
            <svg
              width="14"
              height="14"
              viewBox="0 0 20 20"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className={styles.caret}
              aria-hidden="true"
            >
              <path d="M5 8l5 5 5-5" />
            </svg>
          </span>
          <span className={clsx(styles.meta, meta.tone)}>{meta.text}</span>
        </span>
      </button>

      <button
        type="button"
        className={styles.menu}
        onClick={() => openSheet('session-menu')}
        aria-label="Session settings"
      >
        <svg
          width="22"
          height="22"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M4 7h16M4 12h16M4 17h16" />
        </svg>
      </button>
    </div>
  )
}
