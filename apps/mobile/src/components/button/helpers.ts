//Config
import type { TextTone, TypographyVariant } from '@/config/theme'

//Type
import type { Size, Variant } from './types'

const LABEL_TONE: Record<Variant, TextTone> = {
  primary: 'onAction',
  secondary: 'heading',
  warn: 'onWarn',
  plain: 'muted',
}

const LABEL_VARIANT: Record<Size, TypographyVariant> = {
  sm: 'captionSemiBold',
  md: 'bodySmSemiBold',
}

export const getLabelTone = (variant: Variant): TextTone => LABEL_TONE[variant]

export const getLabelVariant = (size: Size): TypographyVariant => LABEL_VARIANT[size]
