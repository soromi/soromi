import { useMemo } from 'react'
import { useShallow } from 'zustand/react/shallow'

//Packages
import { useClientStore } from '@soromi/client'

//Store
import { useUiStore } from '@/stores/ui-store'

/** Connection state for the status subtitle: which text and tone (color class) the bar shows. */
function statusMeta(connected: boolean, holder: string | null): { text: string; tone: string } {
  if (!connected) return { text: 'Disconnected', tone: 'text-[var(--soromi-text-faint)]' }
  if (holder) return { text: `${holder} in control`, tone: 'text-[var(--soromi-warn)]' }

  return { text: 'Connected', tone: 'text-[var(--soromi-ok)]' }
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
    <div className="flex flex-none items-center justify-between gap-2.5 border-[var(--soromi-border-subtle)] border-t bg-[var(--soromi-bg-sidebar)] px-3 py-2">
      <button
        type="button"
        className="flex min-w-0 cursor-pointer appearance-none items-center gap-2.5 border-none bg-transparent p-1 text-left text-[var(--soromi-text)]"
        onClick={() => openSheet('workspaces')}
      >
        <span className="flex h-[34px] w-[34px] flex-none items-center justify-center rounded-[9px] bg-[var(--soromi-accent)] font-bold text-[13px] text-[var(--soromi-accent-on)] capitalize">
          {name.slice(0, 2)}
        </span>
        <span className="flex min-w-0 flex-col leading-[1.25]">
          <span className="flex min-w-0 items-center gap-[5px]">
            <span className="overflow-hidden text-ellipsis whitespace-nowrap font-semibold text-[15px]">
              {name}
            </span>
            <svg
              width="14"
              height="14"
              viewBox="0 0 20 20"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="flex-none text-[var(--soromi-text-faint)]"
              aria-hidden="true"
            >
              <path d="M5 8l5 5 5-5" />
            </svg>
          </span>
          <span className={`whitespace-nowrap text-[11.5px] ${meta.tone}`}>{meta.text}</span>
        </span>
      </button>

      <button
        type="button"
        className="flex h-[38px] w-[38px] flex-none cursor-pointer appearance-none items-center justify-center rounded-[9px] border-none bg-transparent text-[var(--soromi-text-dim)]"
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
