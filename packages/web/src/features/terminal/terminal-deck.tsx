import { useEffect, useState } from 'react'

//Packages
import { TerminalSurface, useClientStore, useTransport } from '@soromi/client'

//Constants
import { colors } from '@/config/theme'

//Styles
import styles from './terminal-deck.module.css'

/**
 * Keeps a live terminal for every visited session (parked when hidden), so switching tabs or
 * workspaces is instant and preserves scrollback. The daemon owns the PTYs, so a hidden pane
 * keeps running; switching only toggles which one is visible. Never unmounts on navigation.
 */
export function TerminalDeck({ active }: { active?: string }) {
  const transport = useTransport()
  const workspaces = useClientStore((s) => s.workspaces)
  const [visited, setVisited] = useState<string[]>([])

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

  if (visited.length === 0) {
    return <div className={styles.empty}>No open tabs</div>
  }

  return (
    <div className={styles.deck}>
      {visited.map((id) => (
        <TerminalSurface
          key={id}
          transport={transport}
          session={id}
          active={id === active}
          background={colors.bgTerminal}
          foreground={colors.text}
        />
      ))}
    </div>
  )
}
