//Components
import { Text } from '@/components'

//Type
import type { HeaderTitleProps } from '../types'

/** A screen's title in its header, as the wide layout's own header draws it. */
export const HeaderTitle = (props: HeaderTitleProps) => (
  <Text variant="bodySemiBold" numberOfLines={1}>
    {props.title}
  </Text>
)
