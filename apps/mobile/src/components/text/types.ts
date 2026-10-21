import type { TextProps } from 'react-native'

//Config
import type { TextTone, TypographyVariant } from '@/config/theme'

export type Props = TextProps & {
  /** The type style. Sizes and weights are never set by hand. */
  variant?: TypographyVariant
  /** Which of the theme's text colours. */
  tone?: TextTone
}
