import { useCallback, useEffect, useMemo, useRef } from 'react'
import { Animated, Modal, PanResponder, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

//Config
import { useTheme, useThemedStyles } from '@/config/theme'

//Components
import { IconButton } from '../icon-button'

//Constants
import { VIEWER } from './constants'

//Helpers
import {
  clampOffset,
  getDistance,
  getDoubleTapPlacement,
  getPinchScale,
  isDoubleTap,
} from './helpers'

//Styles
import { makeStyles } from './styles'

//Type
import type { GestureResponderEvent, LayoutChangeEvent } from 'react-native'
import type { Placement, Props } from './types'

/** The fingers on the screen, as points. */
const fingers = (event: GestureResponderEvent) =>
  event.nativeEvent.touches.map((touch) => ({ x: touch.pageX, y: touch.pageY }))

/**
 * A picture over everything else, as large as the screen allows: pinched to grow it (up to 4×),
 * dragged to look around it once grown, double-tapped to zoom in or back out. The button at the
 * top, or the system's back gesture, closes it.
 */
export const PictureViewer = (props: Props) => {
  const theme = useTheme()
  const styles = useThemedStyles(makeStyles)
  const insets = useSafeAreaInsets()

  // What is drawn, animated; what it was when the gesture began, and what it is now, for the math.
  const scale = useRef(new Animated.Value(1)).current
  const x = useRef(new Animated.Value(0)).current
  const y = useRef(new Animated.Value(0)).current
  const placed = useRef<Placement>({ scale: 1, x: 0, y: 0 })
  const start = useRef<Placement>({ scale: 1, x: 0, y: 0 })
  const pinch = useRef<number | null>(null)
  const frame = useRef({ width: 0, height: 0 })
  const lastTap = useRef(0)

  const place = useCallback(
    (next: Placement, animated: boolean) => {
      placed.current = next
      if (!animated) {
        scale.setValue(next.scale)
        x.setValue(next.x)
        y.setValue(next.y)
        return
      }
      Animated.parallel([
        Animated.spring(scale, { toValue: next.scale, useNativeDriver: true }),
        Animated.spring(x, { toValue: next.x, useNativeDriver: true }),
        Animated.spring(y, { toValue: next.y, useNativeDriver: true }),
      ]).start()
    },
    [scale, x, y],
  )

  // Each time it opens, the picture starts at the size that fits.
  useEffect(() => {
    if (props.visible) place({ scale: 1, x: 0, y: 0 }, false)
  }, [props.visible, place])

  const responder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: () => true,
        onPanResponderGrant: () => {
          start.current = placed.current
          pinch.current = null
        },
        onPanResponderMove: (event, gesture) => {
          const touches = fingers(event)
          const { width, height } = frame.current
          if (touches.length >= 2) {
            const spread = getDistance(touches[0], touches[1])
            // A second finger came down: the pinch is measured from here.
            if (pinch.current === null) {
              pinch.current = spread
              start.current = placed.current
            }
            const grown = getPinchScale(start.current.scale, pinch.current, spread)
            place(
              {
                scale: grown,
                x: clampOffset(start.current.x, grown, width),
                y: clampOffset(start.current.y, grown, height),
              },
              false,
            )
            return
          }
          if (placed.current.scale <= 1 || pinch.current !== null) return
          place(
            {
              scale: placed.current.scale,
              x: clampOffset(start.current.x + gesture.dx, placed.current.scale, width),
              y: clampOffset(start.current.y + gesture.dy, placed.current.scale, height),
            },
            false,
          )
        },
        onPanResponderRelease: (_event, gesture) => {
          const now = Date.now()
          const moved = Math.hypot(gesture.dx, gesture.dy)
          if (pinch.current === null && isDoubleTap(now - lastTap.current, moved)) {
            lastTap.current = 0
            place(getDoubleTapPlacement(placed.current), true)
            return
          }
          lastTap.current = pinch.current === null && moved < VIEWER.tapSlop ? now : 0
        },
      }),
    [place],
  )

  const handleLayout = useCallback((event: LayoutChangeEvent) => {
    frame.current = {
      width: event.nativeEvent.layout.width,
      height: event.nativeEvent.layout.height,
    }
  }, [])

  const source = useMemo(() => ({ uri: props.uri }), [props.uri])
  const transform = useMemo(
    () => ({ transform: [{ translateX: x }, { translateY: y }, { scale }] }),
    [x, y, scale],
  )
  const closeAt = useMemo(
    () => ({ top: Math.max(insets.top, theme.spacing.md) }),
    [insets.top, theme],
  )

  return (
    <Modal
      visible={props.visible}
      animationType="fade"
      statusBarTranslucent
      navigationBarTranslucent
      supportedOrientations={VIEWER.orientations}
      onRequestClose={props.onClose}
    >
      <View style={styles.root}>
        <View style={styles.frame} onLayout={handleLayout} {...responder.panHandlers}>
          <Animated.Image
            source={source}
            resizeMode="contain"
            accessibilityLabel={props.label}
            style={[styles.picture, transform]}
          />
        </View>
        <View style={[styles.close, closeAt]}>
          <IconButton
            icon="close"
            variant="secondary"
            label={VIEWER.close}
            onPress={props.onClose}
          />
        </View>
      </View>
    </Modal>
  )
}
