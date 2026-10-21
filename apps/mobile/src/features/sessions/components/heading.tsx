import { useCallback, useMemo } from 'react'
import { Pressable } from 'react-native'

//Components
import { Icon, IconButton, Text } from '@/components'

//Config
import { defineStyles, useThemedStyles } from '@/config/theme'

//Components
import { NewSessionAction } from './new-session-action'
import { WorkspaceTally } from './tally'

//Constants
import { SESSIONS } from '../constants/sessions'

//State
import { useWorkspaceActions } from '@/states/workspace/workspace.state.hook'

//Type
import type { PressableStateCallbackType } from 'react-native'
import type { HeadingProps } from '../types'

/**
 * A workspace above its sessions in the sessions column: its name, and what its sessions are up to
 * in a glance. A tap folds the sessions away, or shows them again; its plus starts a session there,
 * and its dots offer the rest (earlier conversations, usage, settings).
 */
export const WorkspaceHeading = (props: HeadingProps) => {
  const styles = useThemedStyles(makeStyles)
  const actions = useWorkspaceActions()
  const name = props.workspace.name
  const open = props.open
  const onMore = props.onMore

  const handleToggle = useCallback(() => actions.setCollapsed(name, open), [actions, name, open])
  const handleMore = useCallback(() => onMore(name), [onMore, name])

  const getStyle = useCallback(
    (state: PressableStateCallbackType) => [styles.root, state.pressed && styles.pressed],
    [styles],
  )

  const state = useMemo(() => ({ expanded: open }), [open])

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={state}
      accessibilityHint={open ? SESSIONS.group.close : SESSIONS.group.open}
      style={getStyle}
      onPress={handleToggle}
    >
      <Icon name={open ? 'chevron-up' : 'chevron-down'} size={16} />
      <Text
        variant="bodySemiBold"
        tone={open ? 'heading' : 'body'}
        numberOfLines={1}
        style={styles.name}
      >
        {name}
      </Text>
      <WorkspaceTally sessions={props.workspace.sessions} />
      <NewSessionAction workspace={props.workspace} />
      <IconButton icon="more" size="sm" label={SESSIONS.group.more} onPress={handleMore} />
    </Pressable>
  )
}

const makeStyles = defineStyles((theme) => ({
  root: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm2,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm2,
  },
  pressed: { backgroundColor: theme.surface.raised },
  name: { flex: 1 },
}))
