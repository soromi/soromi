import { useCallback, useState } from 'react'

//Components
import { ActionRow, Option, Sheet } from '@/components'

//Components

//Constants
import { WORKSPACES } from '../constants/workspaces'

//Type
import type { AddAccountProps } from '../types'

/** The last row of an agent's card: binds it to one more of the accounts that configure it. */
export const AddAccount = (props: AddAccountProps) => {
  const [open, setOpen] = useState(false)
  const onAdd = props.onAdd
  const agent = props.agent

  const handleOpen = useCallback(() => setOpen(true), [])
  const handleClose = useCallback(() => setOpen(false), [])
  const handleSelect = useCallback(
    (account: string) => {
      setOpen(false)
      onAdd(agent, account)
    },
    [onAdd, agent],
  )

  return (
    <>
      <ActionRow icon="plus" label={WORKSPACES.settings.addAccount} onPress={handleOpen} />
      <Sheet visible={open} title={WORKSPACES.settings.addAccount} onClose={handleClose}>
        {props.spare.map((account) => (
          <Option key={account} value={account} label={account} onSelect={handleSelect} />
        ))}
      </Sheet>
    </>
  )
}
