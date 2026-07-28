//Components
import { DevicesWidget } from './devices-widget'
import { UsageWidget } from './usage-widget'

/** The bottom status bar: usage on the left, connected devices on the right. */
export function StatusBar() {
  return (
    <div className="flex h-[34px] flex-none items-center justify-between border-[var(--soromi-border-subtle)] border-t bg-[var(--soromi-bg-app)] px-2 z-[var(--z-status-bar)]">
      <UsageWidget />
      <DevicesWidget />
    </div>
  )
}
