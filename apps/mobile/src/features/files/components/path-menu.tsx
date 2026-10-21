import { useCallback } from 'react'

//Components
import { Option, Sheet } from '@/components'

//Constants
import { FILES } from '../constants/files'

//Helpers
import { getAbsolutePath } from '../helpers'

//Services
import { ClipboardService } from '@/services/clipboard'

//State
import { useDaemonWorkspaceRoot } from '@/states/daemon/daemon.state.hook'

//Type
import type { PathMenuProps } from '../types'

/**
 * What a long press on a file or folder offers: its path on the computer, or its path within the
 * workspace, copied to the phone's clipboard. Each choice shows the path it copies.
 */
export const PathMenu = (props: PathMenuProps) => {
  const root = useDaemonWorkspaceRoot(props.workspace)
  const onClose = props.onClose
  const relative = props.node?.path ?? ''
  const absolute = getAbsolutePath(root, relative)

  const handleSelect = useCallback(
    (path: string) => {
      onClose()
      void ClipboardService.copy(path)
    },
    [onClose],
  )

  return (
    <Sheet visible={props.node !== null} title={props.node?.name ?? ''} onClose={onClose}>
      <Option
        value={absolute}
        label={FILES.menu.absolute}
        hint={absolute}
        onSelect={handleSelect}
      />
      <Option
        value={relative}
        label={FILES.menu.relative}
        hint={relative}
        onSelect={handleSelect}
      />
    </Sheet>
  )
}
