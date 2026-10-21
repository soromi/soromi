import { useCallback, useMemo } from 'react'
import { Pressable } from 'react-native'

//Components
import { IconButton, Text } from '@/components'

//Config
import { defineStyles, useThemedStyles } from '@/config/theme'

//Constants
import { TERMINAL } from '../constants/terminal'

//Type
import type { ShellTabProps } from '../types'

/**
 * One of a workspace's terminals in the strip above them. The one on screen can be closed; a long
 * press on any of them renames it.
 */
export const ShellTab = (props: ShellTabProps) => {
  const styles = useThemedStyles(makeStyles)
  const id = props.shell.id
  const onSelect = props.onSelect
  const onClose = props.onClose
  const onRename = props.onRename
  const active = props.active

  const handleSelect = useCallback(() => onSelect(id), [onSelect, id])

  const handleClose = useCallback(() => onClose(id), [onClose, id])

  const handleRename = useCallback(() => onRename(id), [onRename, id])

  const state = useMemo(() => ({ selected: active }), [active])

  return (
    <Pressable
      accessibilityRole="tab"
      accessibilityState={state}
      accessibilityHint={TERMINAL.shells.renameHint}
      style={[styles.tab, active && styles.active]}
      onPress={handleSelect}
      onLongPress={handleRename}
    >
      <Text variant="captionSemiBold" tone={active ? 'heading' : 'muted'} numberOfLines={1}>
        {props.shell.title}
      </Text>
      {active && (
        <IconButton icon="close" size="sm" label={TERMINAL.shells.close} onPress={handleClose} />
      )}
    </Pressable>
  )
}

const makeStyles = defineStyles((theme) => ({
  tab: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.xs,
    minHeight: 32,
    maxWidth: 160,
    paddingHorizontal: theme.spacing.sm2,
    borderRadius: theme.borderRadius.sm,
  },
  active: { backgroundColor: theme.surface.active },
}))
