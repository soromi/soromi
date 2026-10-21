import { useRouter } from 'expo-router'
import { useCallback, useMemo } from 'react'
import { Pressable, View } from 'react-native'

import { splitPath } from '@soromi/core'

//Components
import { Text } from '@/components'

//Config
import { defineStyles, useThemedStyles } from '@/config/theme'

//Helpers
import { getChangeLetter, getDiffHref, getLetterTone } from '../helpers'

//Type
import type { PressableStateCallbackType } from 'react-native'
import type { ChangeRowProps } from '../types'

/** One changed file: its name, the folder it is in, and its status letter. Opens its diff. */
export const ChangeRow = (props: ChangeRowProps) => {
  const styles = useThemedStyles(makeStyles)
  const router = useRouter()
  const workspace = props.workspace
  const folder = props.folder
  const item = props.item

  const path = useMemo(() => splitPath(item.change.path), [item.change.path])
  const letter = getChangeLetter(item)

  const handleOpen = useCallback(
    () => router.push(getDiffHref(workspace, folder, item)),
    [router, workspace, folder, item],
  )

  const getStyle = useCallback(
    (state: PressableStateCallbackType) => [styles.row, state.pressed && styles.pressed],
    [styles],
  )

  return (
    <Pressable accessibilityRole="button" style={getStyle} onPress={handleOpen}>
      <View style={styles.text}>
        <Text variant="bodySm" numberOfLines={1}>
          {path.name}
        </Text>
        {path.dir !== '' && (
          <Text variant="caption" tone="muted" numberOfLines={1}>
            {path.dir}
          </Text>
        )}
      </View>
      <Text variant="mono" tone={getLetterTone(letter)}>
        {letter}
      </Text>
    </Pressable>
  )
}

const makeStyles = defineStyles((theme) => ({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm2,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
  },
  pressed: { backgroundColor: theme.surface.raised },
  text: { flex: 1, gap: theme.spacing.xxs },
}))
