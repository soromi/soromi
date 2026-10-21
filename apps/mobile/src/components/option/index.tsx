import { useCallback, useMemo } from 'react'
import { Pressable, View } from 'react-native'

//Config
import { useThemedStyles } from '@/config/theme'

//Components
import { Icon } from '../icon'
import { Text } from '../text'

//Styles
import { makeStyles } from './styles'

//Type
import type { PressableStateCallbackType } from 'react-native'
import type { Props } from './types'

/** One choice in a list of them, ticked when it is the one in effect. */
export const Option = ({ selected = false, ...props }: Props) => {
  const styles = useThemedStyles(makeStyles)
  const onSelect = props.onSelect
  const value = props.value
  const disabled = props.disabled

  const handlePress = useCallback(() => onSelect(value), [onSelect, value])

  const getStyle = useCallback(
    (state: PressableStateCallbackType) => [
      styles.row,
      state.pressed && styles.pressed,
      disabled && styles.disabled,
    ],
    [styles, disabled],
  )

  const state = useMemo(() => ({ selected }), [selected])

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={state}
      disabled={props.disabled}
      style={getStyle}
      onPress={handlePress}
    >
      {props.leading}
      <View style={styles.text}>
        <Text variant="bodySemiBold" tone={props.tone}>
          {props.label}
        </Text>
        {props.hint && (
          <Text variant="bodySm" tone="muted">
            {props.hint}
          </Text>
        )}
      </View>
      {selected && <Icon name="check" size={18} tone="action" />}
    </Pressable>
  )
}
