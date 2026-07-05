import { FitAddon } from '@xterm/addon-fit'
import { Unicode11Addon } from '@xterm/addon-unicode11'
import { WebglAddon } from '@xterm/addon-webgl'
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
  session: string
  active: boolean
}

/**
 * One xterm bound to a session (tab). It mounts once and stays alive while its session exists
 * (a "parked buffer"): switching away hides it via CSS instead of unmounting, so its scrollback
 * and scroll position survive and it keeps receiving live output in the background.
 */
export function TerminalPane({ transport, session, active }: TerminalPaneProps) {
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
      allowProposedApi: true,
      theme: { background: colors.bgTerminal, foreground: colors.text },
    })
    const fit = new FitAddon()
    term.loadAddon(fit)
    // Unicode 11 widths, so column counting matches modern CLIs.
    const unicode11 = new Unicode11Addon()
    term.loadAddon(unicode11)
    term.unicode.activeVersion = '11'
    term.open(container)
    termRef.current = term
    fitRef.current = fit

    // GPU renderer; falls back to the DOM renderer on context loss.
    try {
      const webgl = new WebglAddon()
      webgl.onContextLoss(() => webgl.dispose())
      term.loadAddon(webgl)
    } catch {
      // DOM renderer stays.
    }

    const offMessage = transport.onMessage((message) => {
      if (message.type === 'output' && message.session === session) {
        term.write(message.data)
      }
    })
    const inputSub = term.onData((data) => {
      transport.send({ type: 'input', session, data })
    })

    // Attach only after the terminal has real dimensions, so the snapshot replays at the right
    // size (attaching first and resizing later reflows TUI content into garbage). Reconnect
    // re-attaches; the snapshot's reset-prefix keeps that clean.
    let attached = false
    const syncSize = () => {
      if (!term.element || container.clientWidth === 0 || container.clientHeight === 0) return
      try {
        fit.fit()
      } catch {
        return
      }
      transport.send({ type: 'resize', session, cols: term.cols, rows: term.rows })
      if (!attached && transport.isOpen()) {
        attached = true
        transport.send({ type: 'attach', session })
      }
    }

    const observer = new ResizeObserver(syncSize)
    observer.observe(container)
    syncSize()
    const offOpen = transport.onOpen(() => {
      attached = false
      syncSize()
    })

    return () => {
      observer.disconnect()
      offMessage()
      offOpen()
      inputSub.dispose()
      term.dispose()
      termRef.current = null
      fitRef.current = null
    }
  }, [transport, session])

  // Refit and focus when this pane becomes the visible one (a hidden pane can't be fitted).
  useEffect(() => {
    if (!active) return
    const term = termRef.current
    const fit = fitRef.current
    const container = containerRef.current
    if (!term || !fit || !container || !term.element) return
    if (container.clientWidth !== 0 && container.clientHeight !== 0) {
      try {
        fit.fit()
        transport.send({ type: 'resize', session, cols: term.cols, rows: term.rows })
      } catch {
        // Renderer not ready; the mount effect's observer will retry.
      }
    }
    term.focus()
  }, [active, transport, session])

  return (
    <div className={clsx(styles.pane, !active && styles.hidden)}>
      <div ref={containerRef} className={styles.terminal} />
    </div>
  )
}
