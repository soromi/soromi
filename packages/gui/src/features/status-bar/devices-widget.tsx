import { useState } from 'react'

//Packages
import { useTransport } from '@soromi/client'

//Components
import { DevicesDialog } from '@/features/pairing/devices-dialog'

//Hooks
import { useDevices } from '@/features/pairing/use-devices'

/** The status-bar popup trigger (also used by the usage widget). */
const TRIGGER =
  'flex cursor-pointer appearance-none items-center gap-[7px] rounded-lg border-none bg-transparent px-[9px] py-[5px] font-medium text-[var(--soromi-text-dim)] text-xs transition-colors enabled:hover:bg-[var(--soromi-bg-hover)] enabled:hover:text-[var(--soromi-text-dim)] disabled:cursor-default disabled:opacity-[0.55]'

/**
 * The paired devices, at the right of the status bar: how many, and whether any is connected now.
 * A click opens the devices dialog, to pair another or revoke one.
 */
export function DevicesWidget() {
  const transport = useTransport()
  const devices = useDevices(transport)
  const [open, setOpen] = useState(false)
  const connected = devices.devices.some((device) => device.connected)

  return (
    <>
      <button type="button" className={TRIGGER} onClick={() => setOpen(true)}>
        <svg
          width="15"
          height="15"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <rect x="3" y="4" width="14" height="10" rx="1.5" />
          <path d="M7 20h6M10 14v6" />
          <rect x="16.5" y="9" width="5" height="11" rx="1.2" />
        </svg>
        <span>
          <span className="font-semibold text-[var(--soromi-text)]">{devices.devices.length}</span>{' '}
          {devices.devices.length === 1 ? 'device' : 'devices'}
        </span>
        {connected && (
          <span
            title="A device is connected"
            className="h-[7px] w-[7px] rounded-full bg-[var(--soromi-accent)] shadow-[0_0_0_3px_color-mix(in_srgb,var(--soromi-accent)_14%,transparent)]"
          />
        )}
      </button>
      <DevicesDialog
        open={open}
        onOpenChange={setOpen}
        devices={devices.devices}
        paired={devices.paired}
        onPair={devices.pair}
        onRevoke={devices.revoke}
        onDone={devices.done}
      />
    </>
  )
}
