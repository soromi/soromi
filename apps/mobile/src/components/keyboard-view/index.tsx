import { useHeaderHeight } from 'expo-router/react-navigation'
import { KeyboardAvoidingView } from 'react-native'

//Type
import type { Props } from './types'

/**
 * A screen's container that keeps its content clear of the on-screen keyboard: when the keyboard
 * comes up, the bottom of the screen (a composer, a form's button) moves up with it.
 *
 * It pads by however much the keyboard overlaps it, measured from below the navigation header,
 * which is why the header's height is handed over. That works on both platforms, and whether or
 * not the system resizes the window for the keyboard itself (then nothing overlaps, and nothing
 * is added).
 */
export const KeyboardView = (props: Props) => {
  const headerHeight = useHeaderHeight()

  return (
    <KeyboardAvoidingView
      style={props.style}
      behavior="padding"
      keyboardVerticalOffset={headerHeight}
    >
      {props.children}
    </KeyboardAvoidingView>
  )
}
