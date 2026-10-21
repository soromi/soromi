import { View } from 'react-native'

//Components
import { Card } from '@/components'

//Config
import { defineStyles, useThemedStyles } from '@/config/theme'

//Components
import { AttentionRow } from './attention-row'
import { SectionLabel } from './label'

//Constants
import { SESSIONS } from '../constants/sessions'

//Helpers
import { getAttentionKey } from '../helpers'

//Type
import type { AttentionProps } from '../types'

/**
 * The top of the home, while any session needs the person: the ones stuck, waiting for an answer,
 * or finished and not looked at, whichever workspace they are in, on one card.
 */
export const AttentionList = (props: AttentionProps) => {
  const styles = useThemedStyles(makeStyles)

  if (props.items.length === 0) return null

  return (
    <View>
      <SectionLabel title={SESSIONS.home.attention} />
      <View style={styles.card}>
        <Card>
          {props.items.map((item) => (
            <AttentionRow
              key={getAttentionKey(item)}
              item={item}
              now={props.now}
              onMenu={props.onMenu}
            />
          ))}
        </Card>
      </View>
    </View>
  )
}

const makeStyles = defineStyles((theme) => ({
  card: { paddingHorizontal: theme.spacing.md },
}))
