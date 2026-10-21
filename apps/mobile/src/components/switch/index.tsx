import { useMemo } from 'react'
import { Switch as NativeSwitch } from 'react-native'

//Config
import { useTheme } from '@/config/theme'

//Type
import type { Props } from './types'

/** An on and off, in the app's colours: the action green when on. */
export const Switch = (props: Props) => {
  const theme = useTheme()

  const track = useMemo(
    () => ({ false: theme.surface.active, true: theme.surface.action }),
    [theme],
  )

  return (
    <NativeSwitch
      accessibilityLabel={props.label}
      value={props.value}
      disabled={props.disabled}
      trackColor={track}
      thumbColor={theme.text.heading}
      ios_backgroundColor={theme.surface.active}
      onValueChange={props.onChange}
    />
  )
}
