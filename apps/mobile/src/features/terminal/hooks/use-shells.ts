import { useCallback, useMemo } from 'react'

//Services
import { LinkService } from '@/services/link'

//State
import {
  useWorkspaceActions,
  useWorkspaceActiveShell,
  useWorkspaceShells,
} from '@/states/workspace/workspace.state.hook'

/**
 * A workspace's terminals: plain shells on the computer, opened from this phone. The app names
 * each one and keeps the list; the daemon runs them until they are closed, whether or not the app
 * is open. The computer's own terminals are its own: the daemon keeps no list of them to show.
 */
export const useShells = (workspace: string) => {
  const actions = useWorkspaceActions()
  const list = useWorkspaceShells(workspace)
  const selected = useWorkspaceActiveShell(workspace)

  const shells = useMemo(() => list ?? [], [list])
  // None is marked after a restart: the first one is as good as any.
  const active = useMemo(
    () => shells.find((shell) => shell.id === selected) ?? shells[0],
    [shells, selected],
  )

  // The daemon is asked for it by the terminal that shows it, once it knows its size.
  const handleOpen = useCallback(
    (folder: string) => {
      actions.openShell(workspace, folder)
    },
    [actions, workspace],
  )

  const handleSelect = useCallback(
    (id: string) => actions.selectShell(workspace, id),
    [actions, workspace],
  )

  const handleClose = useCallback(
    (id: string) => {
      actions.closeShell(workspace, id)
      LinkService.send({ type: 'close-session', session: id })
    },
    [actions, workspace],
  )

  return { shells, active, handleOpen, handleSelect, handleClose }
}
