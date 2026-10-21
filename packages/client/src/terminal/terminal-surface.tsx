import { CanvasAddon } from '@xterm/addon-canvas'
import { FitAddon } from '@xterm/addon-fit'
import { Unicode11Addon } from '@xterm/addon-unicode11'
import { Terminal } from '@xterm/xterm'
import '@xterm/xterm/css/xterm.css'
import clsx from 'clsx'
import { useEffect, useRef } from 'react'

//Store
import { useClientStore } from '../store/client-store'

//Styles
import styles from './terminal-surface.module.css'

//Types
import type { Transport } from '@soromi/core'

interface TerminalSurfaceProps {
  transport: Transport
  session: string
  active: boolean
  /** Terminal colors, supplied by the host so the engine stays theme-agnostic. */
  background: string
  foreground: string
  /** Font size in px. Hosts can shrink it to fit more columns in a narrow pane. Defaults to 13. */
  fontSize?: number
}

/**
 * One xterm bound to a session (tab). It mounts once and stays alive while its session exists
 * (a "parked buffer"): switching away hides it via CSS instead of unmounting, so its scrollback
 * and scroll position survive and it keeps receiving live output in the background.
 *
 * Only the viewport in control of the terminals types into them and decides their size, which it
 * fits to its own pane. Any other watches: its terminal takes the size the daemon reports (output is
 * drawn for that size, not for this pane) and its keystrokes go nowhere.
 */
export function TerminalSurface({
  transport,
  session,
  active,
  background,
  foreground,
  fontSize = 13,
}: TerminalSurfaceProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const termRef = useRef<Terminal | null>(null)
  const fitRef = useRef<FitAddon | null>(null)
  // Whether this viewport controls the terminals: when it gains control it must re-fit and claim
  // the size (until then the pane showed the terminal at the size of whoever was in control).
  const inControl = useClientStore((s) => s.controlHolder === null)

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const term = new Terminal({
      fontFamily: '"SF Mono", Menlo, Consolas, monospace',
      fontSize,
      cursorBlink: true,
      allowProposedApi: true,
      // Cap scrollback per terminal; parked tabs each keep their own buffer, so this bounds memory.
      // The daemon keeps the real history, so this is only how far back this viewport can scroll.
      scrollback: 1000,
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

    // Canvas renderer: GPU-composited, reliable in the desktop webview, and free of WebGL's
    // per-page context limit (which the parked-buffer model, one live terminal per tab, can hit).
    // The DOM renderer stays as the fallback if canvas fails.
    try {
      term.loadAddon(new CanvasAddon())
    } catch {
      // DOM renderer stays.
    }

    // Read at the moment of use: control can change hands while this terminal stays mounted.
    const controls = () => useClientStore.getState().controlHolder === null

    const offOutput = transport.onOutput((target, data) => {
      if (target === session) term.write(data)
    })
    // The daemon says what size the terminal is: on attach, ahead of the redraw, and whenever the
    // viewport in control changes it. A viewport that is only watching follows. The change goes
    // through the write queue so it lands between the output drawn for the old size and the new.
    const offSize = transport.onMessage((message) => {
      if (message.type !== 'terminal-size' || message.session !== session || controls()) return
      const { cols, rows } = message
      term.write('', () => {
        if (!controls() && (term.cols !== cols || term.rows !== rows)) term.resize(cols, rows)
      })
    })
    const inputSub = term.onData((data) => {
      if (controls()) transport.send({ type: 'input', session, data })
    })

    // Attach only once the pane is laid out. In control, that is when the terminal can be fitted
    // to it and the size claimed, so the redraw arrives at the right size (attaching first and
    // resizing later reflows TUI content into garbage). Reconnect re-attaches; the redraw's
    // reset-prefix keeps that clean.
    let attached = false
    const syncSize = () => {
      if (!term.element || container.clientWidth === 0 || container.clientHeight === 0) return
      if (controls()) {
        try {
          fit.fit()
        } catch {
          return
        }
        transport.send({ type: 'resize', session, cols: term.cols, rows: term.rows })
      }
      if (!attached && transport.isOpen()) {
        attached = true
        // The chat held from an earlier attach goes along, so only what was missed is sent again.
        const chat = useClientStore.getState().chatCursor[session]
        transport.send({ type: 'attach', session, chat })
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
      offOutput()
      offSize()
      offOpen()
      offReset()
      inputSub.dispose()
      term.dispose()
      termRef.current = null
      fitRef.current = null
    }
  }, [transport, session, background, foreground, fontSize])

  // A terminal that is only being watched takes no keystrokes.
  useEffect(() => {
    const term = termRef.current
    if (term) term.options.disableStdin = !inControl
  }, [inControl])

  // Refit and focus when this pane becomes the visible one, or when this viewport gains control (a
  // hidden pane can't be fitted; gaining control needs the size re-sent to claim the PTY).
  useEffect(() => {
    if (!active || !inControl) return
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
  }, [active, inControl, transport, session])

  return (
    <div className={clsx(styles.pane, !active && styles.hidden, !inControl && styles.watching)}>
      <div ref={containerRef} className={styles.terminal} />
    </div>
  )
}
