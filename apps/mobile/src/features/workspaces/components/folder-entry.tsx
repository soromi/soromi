import { useCallback } from 'react'
import { Pressable } from 'react-native'

//Components
import { Icon, Text } from '@/components'

//Config
import { defineStyles, useThemedStyles } from '@/config/theme'

//Constants
import { WORKSPACES } from '../constants/workspaces'

//Type
import type { PressableStateCallbackType } from 'react-native'
import type { FolderEntryProps } from '../types'

/** A folder in the one being browsed: a tap goes into it. */
export const FolderEntry = (props: FolderEntryProps) => {
  const styles = useThemedStyles(makeStyles)
  const onOpen = props.onOpen
  const path = props.path

  const handlePress = useCallback(() => onOpen(path), [onOpen, path])
  const getStyle = useCallback(
    (state: PressableStateCallbackType) => [styles.row, state.pressed && styles.pressed],
    [styles],
  )

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityHint={WORKSPACES.folders.picker.enter}
      style={getStyle}
      onPress={handlePress}
    >
      <Icon name="folder" size={18} tone="muted" />
      <Text variant="body" numberOfLines={1} style={styles.name}>
        {props.name}
      </Text>
      <Icon name="chevron-right" size={16} tone="muted" />
    </Pressable>
  )
}

const makeStyles = defineStyles((theme) => ({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm2,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm2,
  },
  pressed: { backgroundColor: theme.surface.active },
  name: { flex: 1 },
}))
