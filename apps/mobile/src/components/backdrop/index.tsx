import { useMemo } from 'react'
import { View } from 'react-native'
import Svg, { Circle, Defs, Pattern, RadialGradient, Rect, Stop } from 'react-native-svg'

//Config
import { useTheme, useThemedStyles } from '@/config/theme'

//Constants
import { BACKDROP } from './constants'

//Styles
import { makeStyles } from './styles'

//Type
import type { Props } from './types'

/**
 * The dotted ground the desktop marks its moments with (pairing a phone, a first run): a field of
 * dots that fades out softly in every direction into the page, and a faint glow of the accent at
 * its middle. Decorative only; what it holds sits centred on top.
 */
export const Backdrop = (props: Props) => {
  const theme = useTheme()
  const styles = useThemedStyles(makeStyles)
  const size = useMemo(() => ({ height: props.height }), [props.height])

  return (
    <View style={[styles.root, size, props.style]}>
      <Svg style={styles.art} width="100%" height="100%" pointerEvents="none">
        <Defs>
          <Pattern
            id="dots"
            width={BACKDROP.spacing}
            height={BACKDROP.spacing}
            patternUnits="userSpaceOnUse"
          >
            <Circle
              cx={BACKDROP.spacing / 2}
              cy={BACKDROP.spacing / 2}
              r={BACKDROP.dot}
              fill={theme.border.default}
            />
          </Pattern>
          {/* The dots fade out in every direction from the middle, so there is no edge to see. */}
          <RadialGradient id="dotsFade" cx="50%" cy="45%" rx="55%" ry="60%">
            <Stop offset="0.25" stopColor={theme.surface.page} stopOpacity="0" />
            <Stop offset="1" stopColor={theme.surface.page} stopOpacity="1" />
          </RadialGradient>
          <RadialGradient id="glow" cx="50%" cy="42%" rx="45%" ry="42%">
            <Stop offset="0" stopColor={theme.surface.action} stopOpacity={BACKDROP.glow} />
            <Stop offset="1" stopColor={theme.surface.action} stopOpacity="0" />
          </RadialGradient>
        </Defs>
        <Rect width="100%" height="100%" fill="url(#dots)" />
        <Rect width="100%" height="100%" fill="url(#dotsFade)" />
        <Rect width="100%" height="100%" fill="url(#glow)" />
      </Svg>
      {props.children}
    </View>
  )
}
