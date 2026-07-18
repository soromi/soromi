//Packages
import { useUsage } from '@soromi/client'
import { UsageWidget as UsageWidgetView } from '@soromi/ui'

//Store
import { useAppStore } from '@/stores/app-store'

//Utils
import { openExternal } from '@/lib/host'

/**
 * Usage indicator (left of the status bar). Wires the workspace usage hook + external-link opener
 * to the shared presentational widget.
 */
export function UsageWidget() {
  const workspace = useAppStore((state) => state.active)
  const { agents, loading, refresh } = useUsage(workspace)

  return (
    <UsageWidgetView
      agents={agents}
      loading={loading}
      disabled={!workspace}
      onRefresh={refresh}
      onManage={openExternal}
    />
  )
}
