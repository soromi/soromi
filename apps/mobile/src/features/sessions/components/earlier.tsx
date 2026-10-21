import { useRouter } from 'expo-router'
import { useCallback } from 'react'

//Components
import { ActionRow } from '@/components'

//Constants
import { SESSIONS } from '../constants/sessions'

//Helpers
import { getConversationsHref } from '../helpers'

//State
import { useLinkOnline } from '@/states/link/link.state.hook'

//Type
import type { EarlierProps } from '../types'

/** One of a workspace's actions: the way to carry on one of its earlier conversations. */
export const EarlierConversations = (props: EarlierProps) => {
  const router = useRouter()
  const online = useLinkOnline()
  const workspace = props.workspace

  const handlePress = useCallback(
    () => router.push(getConversationsHref(workspace)),
    [router, workspace],
  )

  return (
    <ActionRow
      icon="clock"
      tone="body"
      label={SESSIONS.earlier.label}
      hint={SESSIONS.earlier.hint}
      chevron
      disabled={!online}
      onPress={handlePress}
    />
  )
}
