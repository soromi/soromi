import { agentOptionKey, agentOptionsFor, isCurrentAgent } from '@soromi/core'
import { useCallback, useMemo, useState } from 'react'
import { Alert } from 'react-native'

//Components
import { Chip, Option, ProviderMark, Sheet } from '@/components'

//Constants
import { CHAT } from '../constants/chat'

//Helpers
import { getSwitchMessage } from '../helpers'

//Services
import { LinkService } from '@/services/link'

//State
import { useDaemonAccounts, useDaemonBindings } from '@/states/daemon/daemon.state.hook'

//Type
import type { AgentPickerProps } from '../types'

/**
 * Which provider and account the chat runs under. When the workspace offers more than one (another
 * agent, or another of its accounts for this one) it also switches between them, after asking: the
 * chat restarts under the new one as a new conversation, since neither providers nor accounts
 * share a transcript.
 */
export const AgentPicker = (props: AgentPickerProps) => {
  const [open, setOpen] = useState(false)
  const bindings = useDaemonBindings(props.session)
  const profiles = useDaemonAccounts()
  const session = props.session
  const agent = props.agent

  // Only the agents this workspace binds, as on the desktop: another provider is bound there first.
  const options = useMemo(
    () => agentOptionsFor(bindings ?? [], profiles, false),
    [bindings, profiles],
  )

  const mark = useMemo(() => <ProviderMark provider={agent} />, [agent])

  const handleOpen = useCallback(() => setOpen(true), [])

  const handleClose = useCallback(() => setOpen(false), [])

  const account = props.account
  const handleSelect = useCallback(
    (value: string) => {
      setOpen(false)
      const option = options.find((one) => agentOptionKey(one.agent, one.account) === value)
      if (!option || isCurrentAgent(option, agent, account)) return

      Alert.alert(CHAT.agent.confirm.title, getSwitchMessage(option), [
        { text: CHAT.agent.confirm.cancel, style: 'cancel' },
        {
          text: CHAT.agent.confirm.confirm,
          style: 'destructive',
          onPress: () =>
            LinkService.send({
              type: 'set-session-agent',
              session,
              agent: option.agent,
              account: option.account,
            }),
        },
      ])
    },
    [options, agent, account, session],
  )

  return (
    <>
      <Chip
        filled
        leading={mark}
        label={props.account}
        disabled={!props.enabled}
        onPress={options.length > 1 ? handleOpen : undefined}
      />
      <Sheet visible={open} title={CHAT.agent.title} onClose={handleClose}>
        {options.map((option) => (
          <Option
            key={agentOptionKey(option.agent, option.account)}
            value={agentOptionKey(option.agent, option.account)}
            label={option.label}
            hint={option.accountLabel}
            leading={<ProviderMark provider={option.agent} size={20} />}
            selected={isCurrentAgent(option, agent, account)}
            onSelect={handleSelect}
          />
        ))}
      </Sheet>
    </>
  )
}
