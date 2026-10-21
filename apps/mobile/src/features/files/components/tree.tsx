import { useCallback, useMemo, useState } from 'react'
import { FlatList, View } from 'react-native'

//Components
import { Loader, Text } from '@/components'

//Config
import { defineStyles, useThemedStyles } from '@/config/theme'

//Components
import { PathMenu } from './path-menu'
import { TreeRow } from './tree-row'

//Constants
import { FILES } from '../constants/files'

//Helpers
import { getNodeKey } from '../helpers'

//Hooks
import { useTree } from '../hooks/use-tree'

//Type
import type { FileNode } from '@soromi/core'
import type { ListRenderItemInfo } from 'react-native'
import type { TreeProps } from '../types'

/** A workspace's folders and files, opened a folder at a time. Kept current by the daemon. */
export const FileTree = (props: TreeProps) => {
  const styles = useThemedStyles(makeStyles)
  const workspace = props.workspace
  const nodes = useTree(workspace)

  // The row that was long-pressed, while its menu is open.
  const [target, setTarget] = useState<FileNode | null>(null)

  const handleMenuClose = useCallback(() => setTarget(null), [])

  const renderItem = useCallback(
    (info: ListRenderItemInfo<FileNode>) => (
      <TreeRow workspace={workspace} node={info.item} onMenu={setTarget} />
    ),
    [workspace],
  )

  const empty = useMemo(
    () => (
      <Text variant="bodySm" tone="muted" style={styles.message}>
        {FILES.copy.empty}
      </Text>
    ),
    [styles],
  )

  if (nodes === undefined) {
    return (
      <View style={styles.center}>
        <Loader />
      </View>
    )
  }

  return (
    <>
      <FlatList
        data={nodes}
        keyExtractor={getNodeKey}
        contentContainerStyle={styles.list}
        renderItem={renderItem}
        ListEmptyComponent={empty}
      />
      <PathMenu workspace={workspace} node={target} onClose={handleMenuClose} />
    </>
  )
}

const makeStyles = defineStyles((theme) => ({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  list: { flexGrow: 1, paddingBottom: theme.spacing.xl },
  message: { padding: theme.spacing.xl, textAlign: 'center' },
}))
