import { useCallback, useState } from 'react'

//Components
import { ActionRow, Card, Text } from '@/components'

//Config
import { defineStyles, useThemedStyles } from '@/config/theme'

//Components
import { ChosenFolder } from './chosen-folder'
import { FolderPicker } from './folder-picker'

//Constants
import { WORKSPACES } from '../constants/workspaces'

//Helpers
import { withFolder, withoutFolder } from '../helpers'

//Type
import type { FoldersFieldProps } from '../types'

/** The folders a workspace is made of, on one card: each with the way to take it out, then one more. */
export const FoldersField = (props: FoldersFieldProps) => {
  const styles = useThemedStyles(makeStyles)
  const [picking, setPicking] = useState(false)
  const folders = props.folders
  const onChange = props.onChange

  const handleAdd = useCallback(() => setPicking(true), [])
  const handleClose = useCallback(() => setPicking(false), [])
  const handlePick = useCallback(
    (path: string) => {
      setPicking(false)
      onChange(withFolder(folders, path))
    },
    [folders, onChange],
  )
  const handleRemove = useCallback(
    (path: string) => onChange(withoutFolder(folders, path)),
    [folders, onChange],
  )

  return (
    <>
      <Card>
        {folders.length === 0 && (
          <Text key="none" variant="bodySm" tone="muted" style={styles.none}>
            {WORKSPACES.folders.none}
          </Text>
        )}
        {folders.map((path) => (
          <ChosenFolder key={path} path={path} onRemove={handleRemove} />
        ))}
        <ActionRow key="add" icon="plus" label={WORKSPACES.folders.add} onPress={handleAdd} />
      </Card>
      <FolderPicker visible={picking} onPick={handlePick} onClose={handleClose} />
    </>
  )
}

const makeStyles = defineStyles((theme) => ({
  none: { paddingHorizontal: theme.spacing.md, paddingVertical: theme.spacing.sm2 },
}))
