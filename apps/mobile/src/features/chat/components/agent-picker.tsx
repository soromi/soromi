import { agentOptionsFor } from '@soromi/core'
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
 * Which provider and account the chat runs under. When the workspace can run more than one agent
 * it also switches between them, after asking: the chat restarts under the new one as a new
 * conversation, since providers do not share a transcript.
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

  const handleSelect = useCallback(
    (value: string) => {
      setOpen(false)
      const option = options.find((one) => one.agent === value)
      if (!option || option.agent === agent) return

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
    [options, agent, session],
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
            key={option.agent}
            value={option.agent}
            label={option.label}
            hint={option.accountLabel}
            leading={<ProviderMark provider={option.agent} size={20} />}
            selected={option.agent === agent}
            onSelect={handleSelect}
          />
        ))}
      </Sheet>
    </>
  )
}
