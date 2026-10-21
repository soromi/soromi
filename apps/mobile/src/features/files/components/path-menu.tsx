import { useCallback } from 'react'
import { Alert } from 'react-native'

//Components
import { Option, Sheet } from '@/components'

//Constants
import { FILES } from '../constants/files'

//Helpers
import { getAbsolutePath } from '../helpers'

//Services
import { ClipboardService } from '@/services/clipboard'
import { LinkService } from '@/services/link'

//State
import {
  useDaemonWorkspaceFolders,
  useDaemonWorkspaceRoot,
} from '@/states/daemon/daemon.state.hook'

//Type
import type { PathMenuProps } from '../types'

/**
 * What a long press on a file or folder offers: its path on the computer, or its path within the
 * workspace, copied to the phone's clipboard (each choice shows the path it copies), and moving it
 * to the computer's Trash, after asking. A folder the workspace is made of only leaves it from the
 * desktop, so it cannot be trashed from here.
 */
export const PathMenu = (props: PathMenuProps) => {
  const root = useDaemonWorkspaceRoot(props.workspace)
  const folders = useDaemonWorkspaceFolders(props.workspace)
  const onClose = props.onClose
  const workspace = props.workspace
  const node = props.node
  const relative = node?.path ?? ''
  const absolute = getAbsolutePath(root, relative)
  const canTrash = node !== null && relative !== '.' && !(folders ?? []).includes(relative)

  const handleSelect = useCallback(
    (path: string) => {
      onClose()
      void ClipboardService.copy(path)
    },
    [onClose],
  )

  const handleTrash = useCallback(() => {
    onClose()
    if (!node) return

    Alert.alert(FILES.trash.title[node.type], FILES.trash.message[node.type](node.name), [
      { text: FILES.trash.cancel, style: 'cancel' },
      {
        text: FILES.trash.confirm,
        style: 'destructive',
        onPress: () => LinkService.send({ type: 'trash-path', workspace, path: node.path }),
      },
    ])
  }, [onClose, node, workspace])

  return (
    <Sheet visible={node !== null} title={node?.name ?? ''} onClose={onClose}>
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
      {canTrash && (
        <Option
          value={relative}
          label={FILES.trash.action}
          hint={FILES.trash.hint}
          tone="danger"
          onSelect={handleTrash}
        />
      )}
    </Sheet>
  )
}
