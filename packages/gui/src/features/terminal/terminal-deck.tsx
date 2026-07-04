import { useEffect, useState } from 'react'
import { useShallow } from 'zustand/react/shallow'

//Store
import { useAppStore } from '@/stores/app-store'

//Components
import { TerminalPane } from './terminal-pane'

//Styles
import styles from './terminal-deck.module.css'

//Types
import type { Transport } from '@/services/transport/transport'

/**
 * Keeps a live terminal per visited workspace and shows only the active one. Inactive panes are
 * parked (hidden, not unmounted), so switching back is instant and preserves their scrollback.
 */
export function TerminalDeck({ transport }: { transport: Transport }) {
  const { active, workspaces } = useAppStore(
    useShallow((s) => ({ active: s.active, workspaces: s.workspaces })),
  )
  const [visited, setVisited] = useState<string[]>([])

  // Mount a pane the first time its workspace becomes active.
  useEffect(() => {
    if (!active) return
    setVisited((prev) => (prev.includes(active) ? prev : [...prev, active]))
  }, [active])

  // Drop panes whose workspace no longer exists (removed spaces).
  useEffect(() => {
    setVisited((prev) => {
      const names = new Set(workspaces.map((w) => w.name))
      const next = prev.filter((name) => names.has(name))
      return next.length === prev.length ? prev : next
    })
  }, [workspaces])

  return (
    <div className={styles.deck}>
      {visited.map((name) => (
        <TerminalPane key={name} transport={transport} workspace={name} active={name === active} />
      ))}
    </div>
  )
}
