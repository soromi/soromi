import clsx from 'clsx'
import { useShallow } from 'zustand/react/shallow'

//Packages
import { useClientStore, useUsage } from '@soromi/client'
import { UsageWidget } from '@soromi/ui'

//Store
import { useUiStore } from '@/stores/ui-store'

//Styles
import styles from './status-bar.module.css'

/** The wide layout's bottom status bar: plan usage on the left, connection state on the right. */
export function StatusBar() {
  const active = useUiStore((s) => s.active)
  const { connected, holder } = useClientStore(
    useShallow((s) => ({ connected: s.connected, holder: s.controlHolder })),
  )
  const { agents, loading, refresh } = useUsage(active)

  const text = !connected ? 'Disconnected' : holder ? `${holder} in control` : 'Connected'
  const tone = !connected ? styles.off : holder ? styles.busy : styles.ok

  return (
    <div className={styles.bar}>
      <UsageWidget
        agents={agents}
        loading={loading}
        disabled={!active}
        onRefresh={refresh}
        onManage={(url) => window.open(url, '_blank', 'noopener')}
      />

      <span className={styles.status}>
        <span className={clsx(styles.dot, tone)} />
        {text}
      </span>
    </div>
  )
}
