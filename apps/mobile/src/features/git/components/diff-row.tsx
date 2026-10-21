import { memo } from 'react'
import { View } from 'react-native'

//Components
import { Text } from '@/components'

//Config
import { defineStyles, useThemedStyles } from '@/config/theme'

//Type
import type { DiffRowProps } from '../types'

/** One line of a diff: added, removed, unchanged, or the header of a hunk. */
export const DiffLine = memo((props: DiffRowProps) => {
  const styles = useThemedStyles(makeStyles)
  const kind = props.row.kind

  return (
    <View style={[styles.row, styles[kind]]}>
      <Text variant="mono" selectable style={styles[`${kind}Text`]}>
        {props.row.text === '' ? ' ' : props.row.text}
      </Text>
    </View>
  )
})

const makeStyles = defineStyles((theme) => ({
  row: { paddingHorizontal: theme.spacing.sm2 },
  add: { backgroundColor: theme.diff.add.background },
  del: { backgroundColor: theme.diff.del.background },
  hunk: { backgroundColor: theme.diff.hunk.background, paddingVertical: theme.spacing.xxs },
  ctx: {},
  addText: { color: theme.diff.add.text },
  delText: { color: theme.diff.del.text },
  hunkText: { color: theme.diff.hunk.text },
  ctxText: { color: theme.text.body },
}))
