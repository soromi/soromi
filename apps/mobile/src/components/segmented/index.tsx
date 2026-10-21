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
import type { Props, SegmentProps } from './types'

const Segment = (props: SegmentProps) => {
  const styles = useThemedStyles(makeStyles)
  const onSelect = props.onSelect
  const id = props.option.id

  const active = props.active

  const handlePress = useCallback(() => onSelect(id), [onSelect, id])

  const state = useMemo(() => ({ selected: active }), [active])

  return (
    <Pressable
      accessibilityRole="tab"
      accessibilityState={state}
      style={[styles.segment, active && styles.active]}
      onPress={handlePress}
    >
      {props.option.icon && (
        <Icon name={props.option.icon} size={14} tone={active ? 'action' : 'muted'} />
      )}
      <Text variant="bodySmSemiBold" tone={active ? 'heading' : 'muted'} numberOfLines={1}>
        {props.option.label}
      </Text>
    </Pressable>
  )
}

/** A row of choices of which one is picked: the views of a screen, say. */
export const Segmented = (props: Props) => {
  const styles = useThemedStyles(makeStyles)

  return (
    <View accessibilityRole="tablist" style={styles.root}>
      {props.options.map((option) => (
        <Segment
          key={option.id}
          option={option}
          active={option.id === props.value}
          onSelect={props.onChange}
        />
      ))}
    </View>
  )
}
