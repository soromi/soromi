import { useCallback, useMemo, useRef, useState } from 'react'
import { PanResponder, View } from 'react-native'

//Config
import { useThemedStyles } from '@/config/theme'

//Constants
import { RESIZE_HANDLE } from './constants'

//Styles
import { makeStyles } from './styles'

//Type
import type { AccessibilityActionEvent } from 'react-native'
import type { Props } from './types'

/**
 * The edge of a column that is dragged to make it wider or narrower, as the desktop's sidebars
 * are: a strip along the edge with a grip in its middle, lit while it is held. A screen reader
 * moves it a step at a time instead.
 */
export const ResizeHandle = (props: Props) => {
  const styles = useThemedStyles(makeStyles)
  const [held, setHeld] = useState(false)
  // The responder is made once; it calls whatever the column says now.
  const latest = useRef(props)
  latest.current = props

  const responder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: () => true,
        // A list under the finger does not take the drag over once it has started.
        onPanResponderTerminationRequest: () => false,
        onPanResponderGrant: () => {
          setHeld(true)
          latest.current.onStart()
        },
        onPanResponderMove: (_event, gesture) => latest.current.onMove(gesture.dx),
        onPanResponderRelease: () => {
          setHeld(false)
          latest.current.onEnd()
        },
        onPanResponderTerminate: () => {
          setHeld(false)
          latest.current.onEnd()
        },
      }),
    [],
  )

  const handleAction = useCallback(
    (event: AccessibilityActionEvent) =>
      latest.current.onStep(event.nativeEvent.actionName === 'increment' ? 1 : -1),
    [],
  )

  return (
    <View
      accessible
      accessibilityRole="adjustable"
      accessibilityLabel={props.label}
      accessibilityHint={RESIZE_HANDLE.hint}
      accessibilityActions={RESIZE_HANDLE.actions}
      onAccessibilityAction={handleAction}
      style={[styles.handle, props.edge === 'left' ? styles.left : styles.right]}
      {...responder.panHandlers}
    >
      <View style={[styles.grip, held && styles.active]} />
    </View>
  )
}
