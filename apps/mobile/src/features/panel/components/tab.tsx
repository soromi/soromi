import { useCallback, useMemo } from 'react'
import { Pressable } from 'react-native'

//Components
import { Icon } from '@/components'

//Config
import { defineStyles, useThemedStyles } from '@/config/theme'

//Type
import type { PressableStateCallbackType } from 'react-native'
import type { TabProps } from '../types'

/** One of the panel's views as an icon. The one on screen is marked. */
export const PanelTab = (props: TabProps) => {
  const styles = useThemedStyles(makeStyles)
  const onSelect = props.onSelect
  const id = props.option.id
  const active = props.active

  const handlePress = useCallback(() => onSelect(id), [onSelect, id])

  const getStyle = useCallback(
    (state: PressableStateCallbackType) => [
      styles.tab,
      active && styles.active,
      state.pressed && styles.pressed,
    ],
    [styles, active],
  )

  const state = useMemo(() => ({ selected: active }), [active])

  return (
    <Pressable
      accessibilityRole="tab"
      accessibilityLabel={props.option.label}
      accessibilityState={state}
      hitSlop={4}
      style={getStyle}
      onPress={handlePress}
    >
      <Icon name={props.option.icon} size={18} tone={active ? 'action' : 'muted'} />
    </Pressable>
  )
}

const makeStyles = defineStyles((theme) => ({
  tab: {
    width: 34,
    height: 34,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: theme.borderRadius.md,
  },
  active: { backgroundColor: theme.surface.active },
  pressed: { backgroundColor: theme.surface.raised },
}))
