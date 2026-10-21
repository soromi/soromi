import { useCallback, useEffect, useRef } from 'react'

//Services
import { LinkService } from '@/services/link'

//State
import { DaemonStore } from '@/states/daemon/daemon.state'
import { useDaemonInControl } from '@/states/daemon/daemon.state.hook'
import { useLinkOnline } from '@/states/link/link.state.hook'

//Type
import type { TerminalHandle } from '@/components'
import type { TerminalSize } from '../types'

/**
 * A session's live terminal, wired to the daemon. The device in control drives it: what is typed
 * goes to the session, and the terminal is the size that fits this screen, which the daemon is
 * told before it is asked to draw, so what it draws is laid out for that size. Any other device
 * watches: its keys go nowhere and it takes the size the daemon reports.
 *
 * Attaching makes the daemon redraw the screen as it stands and then stream what follows. It is
 * done once the terminal is on screen (and sized, when driving), and again each time the link
 * comes back or the session's agent is started over.
 *
 * A plain shell is attached to the same way, by its id: it was opened when it was asked for, and
 * shows here once the daemon lists it.
 */
export const useTerminal = (session: string) => {
  const terminal = useRef<TerminalHandle | null>(null)
  const ready = useRef(false)
  // The size last claimed, to claim again on a new connection.
  const size = useRef<TerminalSize | null>(null)
  const inControl = useDaemonInControl()
  const online = useLinkOnline()
  const driving = inControl && online

  const attach = useCallback(() => {
    // What is held of the conversation goes along, so only what was missed is sent again.
    const chat = DaemonStore.getState().chatCursor[session]
    LinkService.send({ type: 'attach', session, chat })
  }, [session])

  useEffect(
    () =>
      LinkService.onOutput((target, data) => {
        if (target === session) terminal.current?.write(data)
      }),
    [session],
  )

  useEffect(
    () =>
      LinkService.onMessage((message) => {
        if (message.type === 'terminal-size' && message.session === session) {
          // Read at the moment of use: control can change hands while the terminal is up.
          const watching = DaemonStore.getState().controlHolder !== null
          if (watching) terminal.current?.size(message.cols, message.rows)
        } else if (message.type === 'session-reset' && message.session === session) {
          terminal.current?.reset()
          attach()
        }
      }),
    [session, attach],
  )

  // The daemon starts every connection from nothing: claim the size again, then attach.
  useEffect(
    () =>
      LinkService.onOpen(() => {
        if (!ready.current) return
        const claimed = size.current
        const controls = DaemonStore.getState().controlHolder === null
        if (claimed && controls) LinkService.send({ type: 'resize', session, ...claimed })
        attach()
      }),
    [session, attach],
  )

  const handleReady = useCallback(() => {
    ready.current = true
    // Driving, the attach waits for the size, which the terminal reports as soon as it is laid
    // out: attaching first and resizing after would have the redraw arrive at the wrong size.
    if (DaemonStore.getState().controlHolder === null) return
    attach()
  }, [attach])

  const handleSize = useCallback(
    (cols: number, rows: number) => {
      const first = size.current === null
      size.current = { cols, rows }
      LinkService.send({ type: 'resize', session, cols, rows })
      if (first) attach()
    },
    [session, attach],
  )

  const handleInput = useCallback(
    (data: string) => LinkService.send({ type: 'input', session, data }),
    [session],
  )

  return { terminal, driving, handleReady, handleSize, handleInput }
}
