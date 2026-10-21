//Components
import { IconButton } from '@/components'

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

/** The plus on a workspace's heading in the sessions column: starts a new chat there. */
export const NewSessionAction = (props: NewSessionProps) => {
  const online = useLinkOnline()
  const create = useNewSession(props.workspace)

  return (
    <>
      <IconButton
        icon="plus"
        size="sm"
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
