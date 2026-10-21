import { SvgXml } from 'react-native-svg'

//Config
import { useTheme } from '@/config/theme'

//Constants
import { MARKS } from './constants'

//Type
import type { Props } from './types'

/** An AI provider's mark, beside the account a session runs under. */
export const ProviderMark = ({ size = 14, ...props }: Props) => {
  const theme = useTheme()
  const mark = MARKS[props.provider]
  if (!mark) return null

  return <SvgXml xml={mark} width={size} height={size} color={theme.text.heading} />
}
