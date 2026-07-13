import { CanvasAddon } from '@xterm/addon-canvas'
import { FitAddon } from '@xterm/addon-fit'
import { Unicode11Addon } from '@xterm/addon-unicode11'
import { Terminal } from '@xterm/xterm'
import '@xterm/xterm/css/xterm.css'
import clsx from 'clsx'
import { useEffect, useRef } from 'react'

//Styles
import styles from './terminal-surface.module.css'

//Types
import type { Transport } from '../transport/transport'

interface TerminalSurfaceProps {
  transport: Transport
  session: string
  active: boolean
  /** Terminal colors, supplied by the host so the engine stays theme-agnostic. */
  background: string
  foreground: string
}

/**
 * One xterm bound to a session (tab). It mounts once and stays alive while its session exists
 * (a "parked buffer"): switching away hides it via CSS instead of unmounting, so its scrollback
 * and scroll position survive and it keeps receiving live output in the background.
 */
export function TerminalSurface({
  transport,
  session,
  active,
  background,
  foreground,
}: TerminalSurfaceProps) {
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
      // Cap scrollback per terminal; parked tabs each keep their own buffer, so this bounds memory.
      scrollback: 2000,
      theme: { background, foreground },
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

    // Canvas renderer: GPU-composited, reliable in WKWebView, and free of WebGL's per-page
    // context limit (which the parked-buffer model, one live terminal per tab, can hit). The DOM
    // renderer stays as a fallback if canvas fails.
    try {
      term.loadAddon(new CanvasAddon())
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
    // The agent was relaunched (folders/account changed): clear and re-attach, so the pane shows
    // the fresh process. The re-attach snapshot's reset-prefix keeps it clean.
    const offReset = transport.onMessage((message) => {
      if (message.type === 'session-reset' && message.session === session) {
        term.reset()
        attached = false
        syncSize()
      }
    })

    return () => {
      observer.disconnect()
      offMessage()
      offOpen()
      offReset()
      inputSub.dispose()
      term.dispose()
      termRef.current = null
      fitRef.current = null
    }
  }, [transport, session, background, foreground])

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
