import { Suspense, lazy, useEffect, useState } from 'react'

//Packages
import { TakeoverScreen, TerminalSurface, useClientStore, useTransport } from '@soromi/client'

//Constants
import { colors } from '@/config/theme'

// Lazy so the chat renderer's weight (streamdown + shiki + the markdown pipeline) splits into its
// own chunk and only loads when a session's chat view is actually opened — not on first paint.
const ChatView = lazy(() => import('./chat-view').then((m) => ({ default: m.ChatView })))

/**
 * Keeps a live terminal for every visited session (parked when hidden), so switching tabs or
 * workspaces is instant and preserves scrollback. For a transcript-capable session (Claude) the
 * reflowing chat view can render over the terminal, with a toggle between the two — the phone
 * defaults to chat (`defaultMode="chat"`), the wide/desktop-web shell to the familiar terminal. The
 * takeover screen covers both when this viewport can't drive.
 */
export function TerminalDeck({
  active,
  fontSize,
  defaultMode = 'terminal',
}: {
  active?: string
  fontSize: number
  defaultMode?: 'chat' | 'terminal'
}) {
  const transport = useTransport()
  const workspaces = useClientStore((s) => s.workspaces)
  // Chat is available whenever the active session is a transcript provider (Claude), not only once
  // events have landed — so the phone shows the chat view (with a waiting state) the moment a session
  // opens, instead of falling back to the terminal until the agent first speaks.
  const chatCapable = workspaces
    .flatMap((w) => w.sessions)
    .some((s) => s.id === active && s.agent === 'claude')
  const [visited, setVisited] = useState<string[]>([])
  const [mode, setMode] = useState<'chat' | 'terminal'>(defaultMode)

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

  const showChat = Boolean(active) && chatCapable && mode === 'chat'

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
      {active && showChat && (
        <Suspense fallback={null}>
          <ChatView session={active} />
        </Suspense>
      )}
      {chatCapable && (
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
