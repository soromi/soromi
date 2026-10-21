//Config
import { defineStyles } from '@/config/theme'

//Type
import type { SyntaxScope } from '@/config/theme'
import type { TextStyle } from 'react-native'

const toStyles = (palette: Record<SyntaxScope, string>) =>
  Object.fromEntries(Object.entries(palette).map(([scope, color]) => [scope, { color }])) as Record<
    SyntaxScope,
    TextStyle
  >

/** A message's code, coloured as the desktop's chat colours it. */
export const makeMessageStyles = defineStyles((theme) => toStyles(theme.syntax.message))

/** A file, coloured as the desktop's file viewer colours it. */
export const makeFileStyles = defineStyles((theme) => toStyles(theme.syntax.file))
