import { useRouter } from 'expo-router'
import { useCallback, useMemo } from 'react'
import { Pressable, View } from 'react-native'

//Components
import { Icon, Text } from '@/components'

//Config
import { defineStyles, useTheme, useThemedStyles } from '@/config/theme'

//Components
import { FileIcon } from './file-icon'

//Constants
import { FILES } from '../constants/files'

//Helpers
import { getChevron, getFileHref } from '../helpers'

//State
import { useWorkspaceActions } from '@/states/workspace/workspace.state.hook'

//Type
import type { PressableStateCallbackType } from 'react-native'
import type { TreeRowProps } from '../types'

/**
 * One row of the tree. A folder opens or closes in place; a file opens on its own screen. A long
 * press on either asks for its menu.
 */
export const TreeRow = (props: TreeRowProps) => {
  const theme = useTheme()
  const styles = useThemedStyles(makeStyles)
  const router = useRouter()
  const actions = useWorkspaceActions()
  const workspace = props.workspace
  const node = props.node
  const onMenu = props.onMenu
  const dir = node.type === 'dir'

  // Set in by its depth.
  const indent = useMemo(
    () => ({ paddingLeft: theme.spacing.md + node.depth * FILES.indent }),
    [theme, node.depth],
  )

  const handlePress = useCallback(() => {
    if (node.type === 'dir') actions.toggleDir(workspace, node.path)
    else router.push(getFileHref(workspace, node.path))
  }, [actions, router, workspace, node.type, node.path])

  const handleLongPress = useCallback(() => onMenu(node), [onMenu, node])

  const getStyle = useCallback(
    (state: PressableStateCallbackType) => [styles.row, indent, state.pressed && styles.pressed],
    [styles, indent],
  )

  return (
    <Pressable
      accessibilityRole="button"
      style={getStyle}
      onPress={handlePress}
      onLongPress={handleLongPress}
    >
      {dir ? (
        <Icon name={getChevron(node)} size={FILES.chevronSize} />
      ) : (
        <View style={styles.spacer} />
      )}
      {dir ? (
        <Icon name="folder" size={FILES.iconSize} tone="body" />
      ) : (
        <FileIcon name={node.name} />
      )}
      <Text
        variant={dir ? 'body' : 'monoBody'}
        tone={node.ignored ? 'muted' : 'heading'}
        numberOfLines={1}
        style={styles.name}
      >
        {node.name}
      </Text>
    </Pressable>
  )
}

const makeStyles = defineStyles((theme) => ({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
    paddingRight: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
  },
  pressed: { backgroundColor: theme.surface.raised },
  // A file has no arrow, and its icon still lines up with the folders' above it.
  spacer: { width: FILES.chevronSize },
  name: { flex: 1 },
}))
