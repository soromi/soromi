import { PERMISSION_MODES, permissionLabel } from '@soromi/core'
import { useCallback, useState } from 'react'

//Components
import { Chip, Option, Sheet } from '@/components'

//Constants
import { CHAT } from '../constants/chat'

//Services
import { LinkService } from '@/services/link'

//Type
import type { PermissionMode } from '@soromi/protocol'
import type { PermissionPickerProps } from '../types'

/** Whether the agent asks before it runs tools, runs edits on its own, runs everything, or only plans. */
export const PermissionPicker = (props: PermissionPickerProps) => {
  const [open, setOpen] = useState(false)
  const session = props.session

  const handleOpen = useCallback(() => setOpen(true), [])

  const handleClose = useCallback(() => setOpen(false), [])

  const handleSelect = useCallback(
    (value: string) => {
      setOpen(false)
      // The values offered are the modes themselves.
      LinkService.send({ type: 'chat-permission-mode', session, mode: value as PermissionMode })
    },
    [session],
  )

  return (
    <>
      <Chip
        icon="shield"
        label={permissionLabel(props.mode)}
        disabled={!props.enabled}
        onPress={handleOpen}
      />
      <Sheet visible={open} title={CHAT.permission.title} onClose={handleClose}>
        {PERMISSION_MODES.map((choice) => (
          <Option
            key={choice.value}
            value={choice.value}
            label={choice.label}
            hint={choice.hint}
            selected={choice.value === props.mode}
            onSelect={handleSelect}
          />
        ))}
      </Sheet>
    </>
  )
}
