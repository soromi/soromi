import { useRouter } from 'expo-router'
import { useCallback } from 'react'

//Components
import { IconButton } from '@/components'

//Constants
import { WORKSPACES } from '../constants/workspaces'

//Helpers
import { getNewWorkspaceHref } from '../helpers'

/** The plus in the home's header: sets up a new workspace on the computer. */
export const NewWorkspaceAction = () => {
  const router = useRouter()

  const handlePress = useCallback(() => router.push(getNewWorkspaceHref()), [router])

  return <IconButton icon="plus" label={WORKSPACES.open.create} onPress={handlePress} />
}
