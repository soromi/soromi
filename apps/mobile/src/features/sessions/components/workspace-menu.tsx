import { useRouter } from 'expo-router'
import { useCallback } from 'react'

//Components
import { Option, Sheet } from '@/components'

//Constants
import { SESSIONS } from '../constants/sessions'

//Helpers
import { getConversationsHref, getUsageHref, getWorkspaceSettingsHref } from '../helpers'

//Type
import type { WorkspaceMenuProps } from '../types'

/**
 * What the dots on a workspace's heading in the sessions column offer: its earlier
 * conversations, its usage and its settings, each a screen of its own beside the column.
 */
export const WorkspaceMenu = (props: WorkspaceMenuProps) => {
  const router = useRouter()
  const workspace = props.workspace
  const onClose = props.onClose

  const handleSelect = useCallback(
    (value: string) => {
      onClose()
      if (!workspace) return
      if (value === 'earlier') router.push(getConversationsHref(workspace))
      if (value === 'usage') router.push(getUsageHref(workspace))
      if (value === 'settings') router.push(getWorkspaceSettingsHref(workspace))
    },
    [onClose, workspace, router],
  )

  return (
    <Sheet visible={workspace !== null} title={workspace ?? ''} onClose={onClose}>
      <Option value="earlier" label={SESSIONS.earlier.label} onSelect={handleSelect} />
      <Option value="usage" label={SESSIONS.usage.label} onSelect={handleSelect} />
      <Option value="settings" label={SESSIONS.group.settings} onSelect={handleSelect} />
    </Sheet>
  )
}
