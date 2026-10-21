import { repoLabel } from '@soromi/core'
import { useCallback, useMemo, useState } from 'react'
import { View } from 'react-native'

//Components
import { Chip, Option, Sheet } from '@/components'

//Config
import { defineStyles, useThemedStyles } from '@/config/theme'

//Constants
import { GIT } from '../constants/git'

//Helpers
import { toRepoChoices } from '../helpers'

//Type
import type { RepoPickerProps } from '../types'

/**
 * Which of the workspace's repositories the changes are shown for, and the way to another: a
 * workspace is often a folder of several, each with a status of its own.
 */
export const RepoPicker = (props: RepoPickerProps) => {
  const styles = useThemedStyles(makeStyles)
  const [open, setOpen] = useState(false)
  const onSelect = props.onSelect

  const choices = useMemo(() => toRepoChoices(props.repos), [props.repos])

  const handleOpen = useCallback(() => setOpen(true), [])

  const handleClose = useCallback(() => setOpen(false), [])

  const handleSelect = useCallback(
    (folder: string) => {
      setOpen(false)
      onSelect(folder)
    },
    [onSelect],
  )

  return (
    <View style={styles.root}>
      <Chip
        filled
        icon="folder"
        label={repoLabel(props.folder, GIT.copy.root)}
        onPress={handleOpen}
      />
      <Sheet visible={open} title={GIT.copy.pick} onClose={handleClose}>
        {choices.map((choice) => (
          <Option
            key={choice.folder}
            value={choice.folder}
            label={choice.label}
            hint={choice.folder}
            selected={choice.folder === props.folder}
            onSelect={handleSelect}
          />
        ))}
      </Sheet>
    </View>
  )
}

const makeStyles = defineStyles((theme) => ({
  root: {
    flexDirection: 'row',
    paddingHorizontal: theme.spacing.md,
    paddingBottom: theme.spacing.xs,
  },
}))
