import { basename } from '@soromi/core'
import { useCallback } from 'react'
import { View } from 'react-native'

//Components
import { Icon, IconButton, Text } from '@/components'

//Config
import { defineStyles, useThemedStyles } from '@/config/theme'

//Constants
import { WORKSPACES } from '../constants/workspaces'

//Type
import type { ChosenFolderProps } from '../types'

/** A folder a workspace is made of, as a row of its card: its name, where it is, and the way out. */
export const ChosenFolder = (props: ChosenFolderProps) => {
  const styles = useThemedStyles(makeStyles)
  const onRemove = props.onRemove
  const path = props.path

  const handleRemove = useCallback(() => onRemove(path), [onRemove, path])

  return (
    <View style={styles.row}>
      <Icon name="folder" size={18} tone="muted" />
      <View style={styles.text}>
        <Text variant="bodySemiBold" numberOfLines={1}>
          {basename(path) || path}
        </Text>
        <Text variant="caption" tone="muted" numberOfLines={1} ellipsizeMode="head">
          {path}
        </Text>
      </View>
      <IconButton icon="close" size="sm" label={WORKSPACES.folders.remove} onPress={handleRemove} />
    </View>
  )
}

const makeStyles = defineStyles((theme) => ({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm2,
    minHeight: theme.control.md,
    paddingLeft: theme.spacing.md,
    paddingRight: theme.spacing.xs,
    paddingVertical: theme.spacing.sm,
  },
  text: { flex: 1, gap: theme.spacing.xxs },
}))
