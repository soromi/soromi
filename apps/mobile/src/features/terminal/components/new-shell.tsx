import { useCallback, useMemo, useState } from 'react'

//Components
import { IconButton, Option, Sheet } from '@/components'

//Constants
import { TERMINAL } from '../constants/terminal'

//Helpers
import { getFolderChoices } from '../helpers'

//State
import { useDaemonWorkspaceFolders } from '@/states/daemon/daemon.state.hook'

//Type
import type { NewShellProps } from '../types'

/**
 * Opens a terminal in a workspace. One made of several folders is asked which to start in, as on
 * the desktop; any other starts at its top.
 */
export const NewShell = (props: NewShellProps) => {
  const [open, setOpen] = useState(false)
  const folders = useDaemonWorkspaceFolders(props.workspace)
  const onOpen = props.onOpen

  const choices = useMemo(() => getFolderChoices(folders, TERMINAL.shells.root), [folders])
  const asks = choices.length > 1

  const handlePress = useCallback(() => {
    if (asks) setOpen(true)
    else onOpen('')
  }, [asks, onOpen])

  const handleClose = useCallback(() => setOpen(false), [])

  const handleSelect = useCallback(
    (folder: string) => {
      setOpen(false)
      onOpen(folder)
    },
    [onOpen],
  )

  return (
    <>
      <IconButton icon="plus" label={TERMINAL.shells.add} onPress={handlePress} />
      <Sheet visible={open} title={TERMINAL.shells.pick} onClose={handleClose}>
        {choices.map((choice) => (
          <Option
            key={choice.folder}
            value={choice.folder}
            label={choice.label}
            hint={choice.folder}
            onSelect={handleSelect}
          />
        ))}
      </Sheet>
    </>
  )
}
