import { useShallow } from 'zustand/react/shallow'

//Packages
import { useClientStore } from '@soromi/client'

//Utils
import { openExternal } from '@/lib/host'

/** A slim strip announcing a newer release. Notify-only: "Download" opens the release page. */
export function UpdateBanner() {
  const { update, dismissedUpdate, dismissUpdate } = useClientStore(
    useShallow((s) => ({
      update: s.update,
      dismissedUpdate: s.dismissedUpdate,
      dismissUpdate: s.dismissUpdate,
    })),
  )

  if (!update || update.version === dismissedUpdate) return null

  return (
    <div className="flex flex-shrink-0 items-center gap-3 border-[var(--soromi-accent-border)] border-b bg-[var(--soromi-accent-dim)] px-4 py-[7px] text-[13px] text-[var(--soromi-accent)]">
      <span className="min-w-0 flex-1 text-[var(--soromi-text)] [&_strong]:font-semibold [&_strong]:text-[var(--soromi-accent)]">
        Soromi <strong>{update.version}</strong> is available.
      </span>
      <button
        type="button"
        className="flex-shrink-0 cursor-pointer appearance-none rounded-lg border border-[var(--soromi-accent-border)] bg-[var(--soromi-accent)] px-3 py-1 font-semibold text-[var(--soromi-accent-on)] text-xs hover:bg-[var(--soromi-ok)]"
        onClick={() => openExternal(update.url)}
      >
        Download
      </button>
      <button
        type="button"
        className="flex-shrink-0 cursor-pointer appearance-none border-none bg-transparent px-0.5 text-[var(--soromi-text-dim)] text-xs opacity-70 hover:opacity-100"
        onClick={dismissUpdate}
        aria-label="Dismiss"
      >
        ✕
      </button>
    </div>
  )
}
