import { useCallback, useEffect, useState } from 'react'
import { Alert } from 'react-native'

//Constants
import { FILES } from '../constants/files'

//Helpers
import { getFileStatus, isEditable } from '../helpers'

//Services
import { LinkService } from '@/services/link'

//State
import { useLinkOnline } from '@/states/link/link.state.hook'
import { useWorkspaceActions, useWorkspaceSave } from '@/states/workspace/workspace.state.hook'

//Type
import type { FileContent } from '@/states/workspace/workspace.state.type'

/**
 * Editing a file from the phone: a draft that starts as the file's content, saving it to the
 * computer, and where that save stands. The file itself only changes once the computer says it
 * wrote it; until then the draft is the only copy of the changes.
 */
export const useEditor = (workspace: string, path: string, file: FileContent) => {
  const actions = useWorkspaceActions()
  const save = useWorkspaceSave(workspace, path)
  const online = useLinkOnline()
  // `null` while the file is only being read.
  const [draft, setDraft] = useState<string | null>(null)

  const editing = draft !== null
  const dirty = editing && draft !== file.content
  const saving = save?.state === 'saving'
  const editable = isEditable(file) && online
  const status = getFileStatus({ file, save, dirty, online })

  const begin = useCallback(() => setDraft(file.content), [file.content])

  const handleSave = useCallback(() => {
    if (draft === null || saving) return
    actions.startSave(workspace, path, draft)
    LinkService.send({ type: 'write-file', workspace, path, content: draft })
  }, [actions, workspace, path, draft, saving])

  // The computer answers a save at once. Silence means the link dropped under it.
  useEffect(() => {
    if (!saving) return
    const timer = setTimeout(() => actions.failSave(workspace, path), FILES.edit.timeoutMs)

    return () => clearTimeout(timer)
  }, [saving, actions, workspace, path])

  const done = useCallback(() => {
    if (!dirty) {
      setDraft(null)
      return
    }
    Alert.alert(FILES.edit.discard.title, FILES.edit.discard.message, [
      { text: FILES.edit.discard.keep, style: 'cancel' },
      { text: FILES.edit.discard.confirm, style: 'destructive', onPress: () => setDraft(null) },
    ])
  }, [dirty])

  return {
    draft,
    editing,
    dirty,
    editable,
    status,
    begin,
    change: setDraft,
    save: handleSave,
    done,
  }
}
