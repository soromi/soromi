import { useShallow } from 'zustand/react/shallow'

//Packages
import { useClientStore } from '@soromi/client'

//Store
import { useAppStore } from '@/stores/app-store'

/** Shared layout for the strip; tone classes layer on top. */
const BANNER =
  'flex flex-shrink-0 items-center gap-2.5 border-[var(--soromi-border)] border-b px-4 py-1.5 text-xs'

/** A slim strip above the workspace: daemon-connection status and dismissible account notices. */
export function StatusBanner() {
  const connected = useClientStore((s) => s.connected)
  const { notice, setNotice } = useAppStore(
    useShallow((s) => ({ notice: s.notice, setNotice: s.setNotice })),
  )

  if (!connected) {
    return (
      <div className={`${BANNER} bg-[var(--soromi-accent-dim)] text-[var(--soromi-accent-on)]`}>
        Connecting to the daemon…
      </div>
    )
  }
  if (notice) {
    return (
      <div className={`${BANNER} bg-[#3a3016] text-[#f0d9a8]`}>
        <span className="min-w-0 flex-1">{notice}</span>
        <button
          type="button"
          className="cursor-pointer appearance-none border-none bg-transparent px-0.5 text-inherit text-xs opacity-70 hover:opacity-100"
          onClick={() => setNotice(null)}
          aria-label="Dismiss"
        >
          ✕
        </button>
      </div>
    )
  }
  return null
}
