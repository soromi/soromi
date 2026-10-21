import { memo } from 'react'
import { Text } from 'react-native'

//Config
import { useThemedStyles } from '@/config/theme'

//Styles
import { makeFileStyles, makeMessageStyles } from './styles'

//Type
import type { Props } from './types'

/**
 * A line of code in colour, with the desktop's palettes. It draws only the coloured runs, so it
 * goes inside a `Text` that sets the font, the size and whether it can be selected.
 */
export const Highlight = memo((props: Props) => {
  const message = useThemedStyles(makeMessageStyles)
  const file = useThemedStyles(makeFileStyles)
  const styles = props.palette === 'message' ? message : file

  return (
    <>
      {props.tokens.map((token, index) => (
        // Runs are drawn in order and never move, so their place is their key.
        // biome-ignore lint/suspicious/noArrayIndexKey: see above.
        <Text key={index} style={styles[token.scope]}>
          {token.text}
        </Text>
      ))}
    </>
  )
})
