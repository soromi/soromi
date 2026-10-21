import { useCallback, useMemo } from 'react'
import { FlatList } from 'react-native'

import { isBinaryDiff } from '@soromi/core'

//Components
import { Text } from '@/components'

//Config
import { defineStyles, useThemedStyles } from '@/config/theme'

//Components
import { DiffLine } from './diff-row'

//Constants
import { GIT } from '../constants/git'

//Helpers
import { getDiffKey, toDiffItems } from '../helpers'

//Type
import type { ListRenderItemInfo } from 'react-native'
import type { DiffItem, DiffProps } from '../types'

/**
 * One file's changes, read-only: additions in green, removals in red, each hunk under its header.
 * Only the lines on screen are drawn.
 */
export const Diff = (props: DiffProps) => {
  const styles = useThemedStyles(makeStyles)
  const patch = props.diff.patch
  const truncated = props.diff.truncated

  const items = useMemo(() => (isBinaryDiff(patch) ? [] : toDiffItems(patch)), [patch])

  const renderItem = useCallback(
    (info: ListRenderItemInfo<DiffItem>) => <DiffLine row={info.item.row} />,
    [],
  )

  const empty = useMemo(
    () => (
      <Text variant="bodySm" tone="muted" style={styles.message}>
        {isBinaryDiff(patch) ? GIT.copy.binary : GIT.copy.noDiff}
      </Text>
    ),
    [patch, styles],
  )

  const footer = useMemo(
    () =>
      truncated ? (
        <Text variant="caption" tone="muted" style={styles.note}>
          {GIT.copy.truncated}
        </Text>
      ) : null,
    [truncated, styles],
  )

  return (
    <FlatList
      data={items}
      keyExtractor={getDiffKey}
      contentContainerStyle={styles.list}
      renderItem={renderItem}
      ListEmptyComponent={empty}
      ListFooterComponent={footer}
    />
  )
}

const makeStyles = defineStyles((theme) => ({
  list: { flexGrow: 1, paddingVertical: theme.spacing.sm },
  message: { padding: theme.spacing.xl, textAlign: 'center' },
  note: { padding: theme.spacing.md },
}))
