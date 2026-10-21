//Config
import type { TextTone } from '@/config/theme'

//Type
import type { Size, Variant } from './types'

const ICON_TONE: Record<Variant, TextTone> = {
  plain: 'muted',
  primary: 'onAction',
  secondary: 'heading',
}

const ICON_SIZE: Record<Size, number> = {
  sm: 14,
  md: 18,
}

export const getIconTone = (variant: Variant): TextTone => ICON_TONE[variant]

export const getIconSize = (size: Size): number => ICON_SIZE[size]
