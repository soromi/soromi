import { useShallow } from 'zustand/react/shallow'

//Packages
import { useClientStore, useUsage } from '@soromi/client'
import { UsageWidget, cn } from '@soromi/ui'

//Store
import { useUiStore } from '@/stores/ui-store'

/** The wide layout's bottom status bar: plan usage on the left, connection state on the right. */
export function StatusBar() {
  const active = useUiStore((s) => s.active)
  const { connected, holder } = useClientStore(
    useShallow((s) => ({ connected: s.connected, holder: s.controlHolder })),
  )
  const { agents, loading, refresh } = useUsage(active)

  const text = !connected ? 'Disconnected' : holder ? `${holder} in control` : 'Connected'
  const tone = !connected
    ? 'bg-[var(--soromi-text-faint)]'
    : holder
      ? 'bg-[var(--soromi-warn)]'
      : 'bg-[var(--soromi-ok)]'

  return (
    <div className="flex flex-none items-center justify-between border-[var(--soromi-border-subtle)] border-t bg-[var(--soromi-bg-app)] px-2 h-[34px]">
      <UsageWidget
        agents={agents}
        loading={loading}
        disabled={!active}
        onRefresh={refresh}
        onManage={(url) => window.open(url, '_blank', 'noopener')}
      />

      <span className="flex items-center gap-[7px] pr-2 text-[var(--soromi-text-dim)] text-xs">
        <span className={cn('h-2 w-2 rounded-full', tone)} />
        {text}
      </span>
    </div>
  )
}
