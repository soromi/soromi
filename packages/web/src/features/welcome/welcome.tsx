/**
 * Shown when connected to the machine but there are no workspaces to drive yet. Workspaces are
 * created on the host (the desktop app), so this points there rather than offering to create one.
 */
export function Welcome() {
  return (
    <div className="fixed inset-0 flex items-center justify-center bg-[var(--soromi-bg-app)] p-10 pt-[calc(40px+var(--safe-top))]">
      <div className="flex flex-col items-center gap-[18px] text-center">
        <div className="relative flex h-[66px] w-[66px] items-center justify-center rounded-[18px] border border-[var(--soromi-accent-border)] bg-[var(--soromi-accent-dim)] text-[var(--soromi-accent)]">
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
        </div>
        <div>
          <div className="font-semibold text-[var(--soromi-text)] text-base">Connected</div>
          <div className="mt-[5px] max-w-[320px] text-[13px] text-[var(--soromi-text-faint)] leading-[1.55]">
            No workspaces yet. Open one in the Soromi app on your machine and it will show up here.
          </div>
        </div>
      </div>
    </div>
  )
}
