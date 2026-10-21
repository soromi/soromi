import { agentOptionKey, agentOptionsFor, sessionAgentFor } from '@soromi/core'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

//Constants
import { SESSIONS } from '../constants/sessions'

//Helpers
import { findOpened } from '../helpers'

//Hooks
import { useOpenSession } from './use-open-session'

//Services
import { LinkService } from '@/services/link'

//State
import { useDaemonAccounts } from '@/states/daemon/daemon.state.hook'

//Type
import type { WorkspaceSummary } from '@soromi/protocol'
import type { PendingSession } from '../types'

/**
 * Starting a chat in a workspace, wherever it is offered from (a row of the workspace's screen,
 * the plus on its heading): asks the computer for one and goes to it once it has opened. A
 * workspace that runs more than one agent asks which first, while `picking`.
 */
export const useNewSession = (workspace: WorkspaceSummary) => {
  const open = useOpenSession()
  const profiles = useDaemonAccounts()
  const [picking, setPicking] = useState(false)
  // The session asked for, until it shows up among the workspace's.
  const pending = useRef<PendingSession | null>(null)
  const name = workspace.name
  const bindings = workspace.accounts
  const sessions = workspace.sessions

  // Only the agents this workspace binds, as on the desktop.
  const options = useMemo(() => agentOptionsFor(bindings, profiles, false), [bindings, profiles])

  useEffect(() => {
    if (!pending.current) return
    const opened = findOpened(sessions, pending.current, Date.now())
    if (!opened) return
    pending.current = null
    open(opened.id)
  }, [sessions, open])

  // Each option is a provider under one of the workspace's accounts for it, picked by both.
  const start = useCallback(
    (key: string | undefined) => {
      const choice = options.find((option) => agentOptionKey(option.agent, option.account) === key)
      const under = sessionAgentFor(bindings, profiles, choice)
      pending.current = { known: sessions.map((session) => session.id), at: Date.now() }
      LinkService.send({
        type: 'open-session',
        workspace: name,
        agent: under.agent,
        account: under.account,
        mode: SESSIONS.create.mode,
      })
    },
    [options, bindings, profiles, sessions, name],
  )

  const handlePress = useCallback(() => {
    if (options.length > 1) setPicking(true)
    else start(options[0] && agentOptionKey(options[0].agent, options[0].account))
  }, [options, start])

  const handleClose = useCallback(() => setPicking(false), [])

  const handleSelect = useCallback(
    (key: string) => {
      setPicking(false)
      start(key)
    },
    [start],
  )

  return { options, picking, handlePress, handleClose, handleSelect }
}
