import { useCallback, useMemo, useState } from 'react'

//Services
import { LinkService } from '@/services/link'

//State
import { useDaemonWorkspaceShells } from '@/states/daemon/daemon.state.hook'
import { getShellAfter, newShellId } from '@/states/workspace/workspace.state.helpers'
import {
  useWorkspaceActions,
  useWorkspaceActiveShell,
} from '@/states/workspace/workspace.state.hook'

//Type
import type { ShellSummary } from '@soromi/protocol'

/** No terminals, the same array every time. */
const NONE: ShellSummary[] = []

/**
 * A workspace's terminals: plain shells on the computer. The daemon keeps the list, the same on
 * every device, so one opened, renamed or closed on the desktop is here too, and the reverse.
 * Which one is on screen is this phone's own.
 */
export const useShells = (workspace: string) => {
  const actions = useWorkspaceActions()
  const list = useDaemonWorkspaceShells(workspace)
  const selected = useWorkspaceActiveShell(workspace)
  // The one whose name is being changed, as it was when the sheet opened.
  const [renaming, setRenaming] = useState<ShellSummary | null>(null)

  const shells = list ?? NONE
  // The one picked here while it is open; otherwise the first.
  const active = useMemo(
    () => shells.find((shell) => shell.id === selected) ?? shells[0],
    [shells, selected],
  )

  // On screen from the start: it shows as soon as the daemon lists it.
  const handleOpen = useCallback(
    (folder: string) => {
      const shell = newShellId()
      actions.selectShell(workspace, shell)
      LinkService.send({ type: 'open-shell', workspace, shell, folder })
    },
    [actions, workspace],
  )

  const handleSelect = useCallback(
    (id: string) => actions.selectShell(workspace, id),
    [actions, workspace],
  )

  // Closed for every device. The one beside it takes its place on screen here.
  const shown = active?.id
  const handleClose = useCallback(
    (id: string) => {
      const next = id === shown ? getShellAfter(shells, id) : undefined
      if (next) actions.selectShell(workspace, next)
      LinkService.send({ type: 'close-session', session: id })
    },
    [actions, workspace, shells, shown],
  )

  // Only while it is still open: one closed meanwhile, on any device, closes the sheet with it.
  const renamed = useMemo(
    () => (renaming && shells.some((shell) => shell.id === renaming.id) ? renaming : null),
    [shells, renaming],
  )

  const handleRename = useCallback(
    (id: string) => setRenaming(shells.find((shell) => shell.id === id) ?? null),
    [shells],
  )

  const handleRenamed = useCallback(() => setRenaming(null), [])

  return {
    shells,
    active,
    renamed,
    handleOpen,
    handleSelect,
    handleClose,
    handleRename,
    handleRenamed,
  }
}
