import { useEffect, useMemo, useRef } from 'react'
import { Animated, Easing, View } from 'react-native'

//Config
import { useThemedStyles } from '@/config/theme'

//Constants
import { WORKING_MARK } from './constants'

//Styles
import { makeStyles } from './styles'

/** The mark beside "the agent is working": three bars that light up in turn, for as long as it shows. */
export const WorkingMark = () => {
  const styles = useThemedStyles(makeStyles)
  const progress = useRef(new Animated.Value(0)).current

  useEffect(() => {
    const loop = Animated.loop(
      Animated.timing(progress, {
        toValue: 1,
        duration: WORKING_MARK.duration,
        easing: Easing.linear,
        useNativeDriver: true,
      }),
    )
    loop.start()

    return () => loop.stop()
  }, [progress])

  const bars = useMemo(
    () =>
      WORKING_MARK.bars.map((bar) => ({
        id: bar.id,
        style: {
          width: bar.width,
          opacity: progress.interpolate({
            inputRange: bar.inputRange,
            outputRange: bar.outputRange,
          }),
        },
      })),
    [progress],
  )

  return (
    <View style={styles.mark}>
      {bars.map((bar) => (
        <Animated.View key={bar.id} style={[styles.bar, bar.style]} />
      ))}
    </View>
  )
}
