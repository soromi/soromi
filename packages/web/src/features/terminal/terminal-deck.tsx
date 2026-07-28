import { useEffect, useState } from 'react'

//Packages
import { TakeoverScreen, TerminalSurface, useClientStore, useTransport } from '@soromi/client'

//Constants
import { colors } from '@/config/theme'

//Components
import { ChatView } from './chat-view'

/**
 * Keeps a live terminal for every visited session (parked when hidden), so switching tabs or
 * workspaces is instant and preserves scrollback. When a session has a transcript (Claude), the
 * reflowing chat view is shown over the terminal by default (better on a phone); a toggle switches
 * back to the raw terminal. The takeover screen covers both when this viewport can't drive.
 */
export function TerminalDeck({ active, fontSize }: { active?: string; fontSize: number }) {
  const transport = useTransport()
  const workspaces = useClientStore((s) => s.workspaces)
  const hasChat = useClientStore((s) => (active ? (s.chat[active]?.length ?? 0) > 0 : false))
  const [visited, setVisited] = useState<string[]>([])
  const [mode, setMode] = useState<'chat' | 'terminal'>('chat')

  // Mount a pane the first time its session becomes the active one.
  useEffect(() => {
    if (active) setVisited((prev) => (prev.includes(active) ? prev : [...prev, active]))
  }, [active])

  // Drop panes whose session no longer exists (closed tabs, removed workspaces).
  useEffect(() => {
    const live = new Set(workspaces.flatMap((w) => w.sessions.map((s) => s.id)))
    setVisited((prev) => {
      const next = prev.filter((id) => live.has(id))
      return next.length === prev.length ? prev : next
    })
  }, [workspaces])

  const showChat = Boolean(active) && hasChat && mode === 'chat'

  return (
    // `isolate` contains the takeover overlay's stacking to the terminal area (off the top/key bars).
    <div className="relative isolate flex min-h-0 min-w-0 flex-1 bg-[var(--soromi-bg-terminal)]">
      {visited.length === 0 && (
        <div className="flex flex-1 items-center justify-center text-[var(--soromi-text-faint)] text-sm">
          No open tabs
        </div>
      )}
      {visited.map((id) => (
        <TerminalSurface
          key={id}
          transport={transport}
          session={id}
          active={id === active}
          background={colors.bgTerminal}
          foreground={colors.text}
          fontSize={fontSize}
          renderer="dom"
        />
      ))}
      {active && showChat && <ChatView session={active} />}
      {hasChat && (
        <button
          type="button"
          className="absolute top-2 right-2.5 z-[5] cursor-pointer appearance-none rounded-full border border-[var(--soromi-border)] bg-[var(--soromi-bg-active)] px-3 py-[5px] font-semibold text-[var(--soromi-text)] text-xs"
          onClick={() => setMode((current) => (current === 'chat' ? 'terminal' : 'chat'))}
        >
          {mode === 'chat' ? 'Terminal' : 'Chat'}
        </button>
      )}
      <TakeoverScreen />
    </div>
  )
}
