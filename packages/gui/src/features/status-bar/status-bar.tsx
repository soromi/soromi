import { useShallow } from 'zustand/react/shallow'

//Packages
import { useClientStore, useTransport } from '@soromi/client'
import { cn } from '@soromi/ui'

//Store
import { useAppStore } from '@/stores/app-store'

//Components
import { DevicesWidget } from './devices-widget'
import { UsageWidget } from './usage-widget'

/** The bottom status bar: usage + devices on the left, and the Terminal/Chat view toggle on the right. */
export function StatusBar() {
  return (
    <div className="z-[var(--z-status-bar)] flex h-[28px] flex-none items-center gap-1 bg-[var(--soromi-bg-shell)] px-6">
      <UsageWidget />
      <DevicesWidget />
      <div className="flex-1" />
      <ModeToggle />
    </div>
  )
}

/** Segmented Terminal / Chat toggle for the active session — switches its backend live. */
function ModeToggle() {
  const transport = useTransport()
  const { active, activeSession } = useAppStore(
    useShallow((s) => ({ active: s.active, activeSession: s.activeSession })),
  )
  const workspaces = useClientStore((s) => s.workspaces)
  const workspace = workspaces.find((w) => w.name === active)
  const sessionId = active ? activeSession[active] : undefined
  const session = workspace?.sessions.find((s) => s.id === sessionId)
  if (!session) return null

  const mode = session.mode
  const setMode = (next: 'terminal' | 'chat') => {
    if (next !== mode) transport.send({ type: 'switch-mode', session: session.id, mode: next })
  }

  return (
    <div className="flex items-center gap-[2px]">
      <ModeButton active={mode !== 'chat'} onClick={() => setMode('terminal')} label="Terminal">
        <svg
          width="15"
          height="15"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.7"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M5 7l4 4-4 4M12 15h7" />
        </svg>
      </ModeButton>
      <ModeButton active={mode === 'chat'} onClick={() => setMode('chat')} label="Chat">
        <svg
          width="15"
          height="15"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.7"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M20 4H4a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h3v3l4-3h9a1 1 0 0 0 1-1V5a1 1 0 0 0-1-1Z" />
        </svg>
      </ModeButton>
    </div>
  )
}

function ModeButton({
  active,
  onClick,
  label,
  children,
}: {
  active: boolean
  onClick: () => void
  label: string
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={label}
      className={cn(
        'flex cursor-pointer appearance-none items-center gap-[7px] rounded-lg border-none bg-transparent px-[10px] py-[5px] font-medium text-[12px] transition-colors',
        active
          ? 'bg-[var(--soromi-bg-hover)] text-[var(--soromi-text-dim)]'
          : 'text-[var(--soromi-text-faint)] hover:bg-[var(--soromi-bg-hover)] hover:text-[var(--soromi-text-dim)]',
      )}
    >
      {children}
      {label}
    </button>
  )
}
