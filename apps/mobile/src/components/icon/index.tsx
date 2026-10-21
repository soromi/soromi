//Config
import { useTheme } from '@/config/theme'

//Constants
import { ICON, ICONS } from './constants'

//Type
import type { Props } from './types'

/** One of the app's icons, in a theme colour. */
export const Icon = ({ size = 16, tone = 'muted', filled = false, ...props }: Props) => {
  const theme = useTheme()
  const Glyph = ICONS[props.name]
  const color = props.color ?? theme.text[tone]

  return (
    <Glyph
      size={size}
      color={color}
      fill={filled ? color : ICON.hollow}
      strokeWidth={ICON.strokeWidth}
    />
  )
}
