import { useCallback, useMemo } from 'react'
import { FlatList } from 'react-native'

//Components
import { Text, getPathLanguage, highlightLines } from '@/components'

//Config
import { defineStyles, useThemedStyles } from '@/config/theme'

//Components
import { Line } from './line'

//Constants
import { FILES } from '../constants/files'

//Helpers
import { getLineKey, toLines } from '../helpers'

//Type
import type { ListRenderItemInfo } from 'react-native'
import type { CodeLine, CodeProps } from '../types'

/**
 * A file's source, line by line with line numbers, coloured by its language as the desktop's file
 * viewer colours it. Only the lines on screen are drawn, so a large file opens as fast as a small
 * one.
 */
export const Code = (props: CodeProps) => {
  const styles = useThemedStyles(makeStyles)
  const content = props.content
  const truncated = props.truncated
  const path = props.path

  const lines = useMemo(
    () => toLines(content, highlightLines(content, getPathLanguage(path))),
    [content, path],
  )

  const renderItem = useCallback(
    (info: ListRenderItemInfo<CodeLine>) => <Line line={info.item} />,
    [],
  )

  const footer = useMemo(
    () =>
      truncated ? (
        <Text variant="caption" tone="muted" style={styles.note}>
          {FILES.copy.truncated}
        </Text>
      ) : null,
    [truncated, styles],
  )

  return (
    <FlatList
      data={lines}
      keyExtractor={getLineKey}
      contentContainerStyle={styles.list}
      renderItem={renderItem}
      ListFooterComponent={footer}
    />
  )
}

const makeStyles = defineStyles((theme) => ({
  list: { paddingVertical: theme.spacing.sm2 },
  note: { padding: theme.spacing.md },
}))
