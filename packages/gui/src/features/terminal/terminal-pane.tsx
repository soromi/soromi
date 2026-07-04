import { FitAddon } from '@xterm/addon-fit'
import { Terminal } from '@xterm/xterm'
import '@xterm/xterm/css/xterm.css'
import clsx from 'clsx'
import { useEffect, useRef } from 'react'

//Constants
import { colors } from '@/config/theme'

//Styles
import styles from './terminal-pane.module.css'

//Types
import type { Transport } from '@/services/transport/transport'

interface TerminalPaneProps {
  transport: Transport
  workspace: string
  active: boolean
}

/**
 * One xterm bound to a workspace session. It mounts once and stays alive while its workspace
 * exists (a "parked buffer"): switching away hides it via CSS instead of unmounting, so its
 * scrollback and scroll position survive and it keeps receiving live output in the background.
 */
export function TerminalPane({ transport, workspace, active }: TerminalPaneProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const termRef = useRef<Terminal | null>(null)
  const fitRef = useRef<FitAddon | null>(null)

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const term = new Terminal({
      fontFamily: '"SF Mono", Menlo, Consolas, monospace',
      fontSize: 13,
      cursorBlink: true,
      theme: { background: colors.bgTerminal, foreground: colors.text },
    })
    const fit = new FitAddon()
    term.loadAddon(fit)
    term.open(container)
    termRef.current = term
    fitRef.current = fit

    const offMessage = transport.onMessage((message) => {
      if (message.type === 'output' && message.workspace === workspace) {
        term.write(message.data)
      }
    })
    const inputSub = term.onData((data) => {
      transport.send({ type: 'input', workspace, data })
    })

    // Attach once on the current connection and again on every reconnect. The daemon replays
    // scrollback on attach, so a plain workspace switch never re-attaches.
    const attach = () => transport.send({ type: 'attach', workspace })
    const offOpen = transport.onOpen(attach)
    if (transport.isOpen()) attach()

    return () => {
      offMessage()
      offOpen()
      inputSub.dispose()
      term.dispose()
      termRef.current = null
      fitRef.current = null
    }
  }, [transport, workspace])

  // Fit and report size only while visible; a hidden pane has no dimensions to fit. A
  // ResizeObserver refits on any container size change (activation, window resize, layout
  // settling after mount), so the terminal always fills its pane.
  useEffect(() => {
    if (!active) return
    const term = termRef.current
    const fit = fitRef.current
    const container = containerRef.current
    if (!term || !fit || !container) return

    const syncSize = () => {
      if (container.clientWidth === 0 || container.clientHeight === 0) return
      fit.fit()
      transport.send({ type: 'resize', workspace, cols: term.cols, rows: term.rows })
    }
    syncSize()
    term.focus()

    const observer = new ResizeObserver(syncSize)
    observer.observe(container)
    return () => observer.disconnect()
  }, [active, transport, workspace])

  return (
    <div className={clsx(styles.pane, !active && styles.hidden)}>
      <div ref={containerRef} className={styles.terminal} />
    </div>
  )
}
