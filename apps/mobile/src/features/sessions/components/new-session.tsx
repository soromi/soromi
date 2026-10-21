import { agentOptionKey, agentOptionsFor, sessionAgentFor } from '@soromi/core'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Pressable } from 'react-native'

//Components
import { Icon, Option, ProviderMark, Sheet, Text } from '@/components'

//Config
import { defineStyles, useThemedStyles } from '@/config/theme'

//Constants
import { SESSIONS } from '../constants/sessions'

//Helpers
import { findOpened } from '../helpers'

//Hooks
import { useOpenSession } from '../hooks/use-open-session'

//Services
import { LinkService } from '@/services/link'

//State
import { useDaemonAccounts } from '@/states/daemon/daemon.state.hook'
import { useLinkOnline } from '@/states/link/link.state.hook'

//Type
import type { PressableStateCallbackType } from 'react-native'
import type { NewSessionProps, PendingSession } from '../types'

/**
 * Under a workspace's sessions: starts a new chat there, and goes to it once the computer has
 * opened it. A workspace that runs more than one agent asks which first.
 */
export const NewSession = (props: NewSessionProps) => {
  const styles = useThemedStyles(makeStyles)
  const open = useOpenSession()
  const profiles = useDaemonAccounts()
  const online = useLinkOnline()
  const [picking, setPicking] = useState(false)
  // The session asked for, until it shows up among the workspace's.
  const pending = useRef<PendingSession | null>(null)
  const name = props.workspace.name
  const bindings = props.workspace.accounts
  const sessions = props.workspace.sessions

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

  const getStyle = useCallback(
    (state: PressableStateCallbackType) => [
      styles.row,
      state.pressed && styles.pressed,
      !online && styles.disabled,
    ],
    [styles, online],
  )

  return (
    <>
      <Pressable
        accessibilityRole="button"
        disabled={!online}
        style={getStyle}
        onPress={handlePress}
      >
        <Icon name="plus" size={14} />
        <Text variant="bodySm" tone="muted">
          {SESSIONS.create.label}
        </Text>
      </Pressable>
      <Sheet visible={picking} title={SESSIONS.create.title} onClose={handleClose}>
        {options.map((option) => (
          <Option
            key={agentOptionKey(option.agent, option.account)}
            value={agentOptionKey(option.agent, option.account)}
            label={option.label}
            hint={option.accountLabel}
            leading={<ProviderMark provider={option.agent} size={20} />}
            onSelect={handleSelect}
          />
        ))}
      </Sheet>
    </>
  )
}

const makeStyles = defineStyles((theme) => ({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm2,
    // Under the sessions' names, past their dots.
    paddingLeft: theme.spacing.xl,
    paddingRight: theme.spacing.md,
    paddingVertical: theme.spacing.sm2,
  },
  pressed: { backgroundColor: theme.surface.raised },
  disabled: { opacity: 0.5 },
}))
