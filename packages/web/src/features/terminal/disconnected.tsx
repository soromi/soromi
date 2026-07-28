//Packages
import { useClientStore, useTransport } from '@soromi/client'

/**
 * Covers the whole app when the link to the daemon drops (rendered at the app root), so a
 * disconnected viewport shows this instead of an empty, unusable shell. The transport reconnects on
 * its own; the button just kicks it immediately. Renders nothing while connected.
 */
export function Disconnected() {
  const transport = useTransport()
  const connected = useClientStore((s) => s.connected)

  if (connected) return null

  return (
    // Covers the whole app (over the shell and any overlay portal): with no daemon there is nothing
    // usable to show, so the disconnected view replaces everything.
    <div className="fixed inset-0 z-[400] flex items-center justify-center bg-[var(--soromi-bg-app)] p-10 pt-[calc(40px+var(--safe-top))]">
      <div className="flex flex-col items-center gap-[18px] text-center">
        <div className="relative flex h-[66px] w-[66px] items-center justify-center rounded-[18px] border border-[var(--soromi-border)] bg-[var(--soromi-bg-hover)] text-[var(--soromi-text-faint)]">
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
          <span className="absolute right-[-4px] bottom-[-4px] flex h-[18px] w-[18px] items-center justify-center rounded-full border border-[#2f2f33] bg-[#161618]">
            <span className="h-[7px] w-[7px] rounded-full bg-[var(--soromi-text-faint)]" />
          </span>
        </div>
        <div>
          <div className="font-semibold text-[var(--soromi-text)] text-base">Disconnected</div>
          <div className="mt-[5px] max-w-[320px] text-[13px] text-[var(--soromi-text-faint)] leading-[1.55]">
            Lost connection to your machine. Reconnect to resume this session.
          </div>
        </div>
        <button
          type="button"
          className="flex cursor-pointer appearance-none items-center gap-2 rounded-[10px] border-none bg-[var(--soromi-accent)] px-5 py-2.5 font-bold text-[13.5px] text-[var(--soromi-accent-on)]"
          onClick={() => transport.connect()}
        >
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M21 12a9 9 0 1 1-3-6.7M21 4v5h-5" />
          </svg>
          Reconnect
        </button>
      </div>
    </div>
  )
}
