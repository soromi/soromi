//Components
import { ActionRow } from '@/components'

//Components
import { NewSessionSheet } from './new-session-sheet'

//Constants
import { SESSIONS } from '../constants/sessions'

//Hooks
import { useNewSession } from '../hooks/use-new-session'

//State
import { useLinkOnline } from '@/states/link/link.state.hook'

//Type
import type { NewSessionProps } from '../types'

/**
 * The first of a workspace's actions: starts a new chat there, and goes to it once the computer
 * has opened it.
 */
export const NewSession = (props: NewSessionProps) => {
  const online = useLinkOnline()
  const create = useNewSession(props.workspace)

  return (
    <>
      <ActionRow
        icon="plus"
        label={SESSIONS.create.label}
        disabled={!online}
        onPress={create.handlePress}
      />
      <NewSessionSheet
        visible={create.picking}
        options={create.options}
        onSelect={create.handleSelect}
        onClose={create.handleClose}
      />
    </>
  )
}
