import { useCallback, useState } from 'react'
import { Pressable } from 'react-native'

//Components
import { Icon, Option, Sheet, Text } from '@/components'

//Config
import { defineStyles, useThemedStyles } from '@/config/theme'

//Type
import type { PressableStateCallbackType } from 'react-native'
import type { ChoiceFieldProps } from '../types'

/**
 * One value of a few to pick, as a form has it: a field the height of a text box, showing the value
 * and a chevron, which opens a sheet of the others.
 */
export const ChoiceField = (props: ChoiceFieldProps) => {
  const styles = useThemedStyles(makeStyles)
  const [open, setOpen] = useState(false)
  const onChange = props.onChange
  const disabled = props.disabled
  const current = props.choices.find((choice) => choice.value === props.value)

  const handleOpen = useCallback(() => setOpen(true), [])
  const handleClose = useCallback(() => setOpen(false), [])
  const handleSelect = useCallback(
    (value: string) => {
      setOpen(false)
      onChange(value)
    },
    [onChange],
  )

  const getStyle = useCallback(
    (state: PressableStateCallbackType) => [
      styles.field,
      state.pressed && styles.pressed,
      disabled && styles.disabled,
    ],
    [styles, disabled],
  )

  return (
    <>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={props.title}
        disabled={disabled}
        style={getStyle}
        onPress={handleOpen}
      >
        {props.leading}
        <Text variant="body" numberOfLines={1} style={styles.value}>
          {current?.label ?? props.value}
        </Text>
        <Icon name="chevron-down" size={16} tone="muted" />
      </Pressable>
      <Sheet visible={open} title={props.title} onClose={handleClose}>
        {props.choices.map((choice) => (
          <Option
            key={choice.value}
            value={choice.value}
            label={choice.label}
            selected={choice.value === props.value}
            onSelect={handleSelect}
          />
        ))}
      </Sheet>
    </>
  )
}

const makeStyles = defineStyles((theme) => ({
  field: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
    minHeight: theme.control.md,
    paddingHorizontal: theme.spacing.md,
    borderRadius: theme.borderRadius.lg,
    backgroundColor: theme.surface.raised,
  },
  value: { flex: 1 },
  pressed: { backgroundColor: theme.surface.active },
  disabled: { opacity: 0.5 },
}))
