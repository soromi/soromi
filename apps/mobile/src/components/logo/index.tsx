import { SvgXml } from 'react-native-svg'

//Constants
import { LOGO } from './constants'

//Type
import type { Props } from './types'

/** Soromi's mark: the three bars the desktop has beside its name. */
export const Logo = ({ size = 18 }: Props) => <SvgXml xml={LOGO} width={size} height={size} />
