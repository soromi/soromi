import { Stack, useLocalSearchParams } from 'expo-router'
import { useMemo } from 'react'
import { View } from 'react-native'

//Components
import { Loader } from '@/components'

//Config
import { defineStyles, useThemedStyles } from '@/config/theme'

//Features
import { Diff } from '@/features/git/components/diff'
import { LinkBanner } from '@/features/layout/components/link-banner'

//Helpers
import { getFileName } from '@/features/files/helpers'

//Hooks
import { useDiff } from '@/features/git/hooks/use-diff'

/** One changed file's diff, read-only. */
export const DiffScreen = () => {
  const styles = useThemedStyles(makeStyles)
  const params = useLocalSearchParams<{
    name: string
    folder?: string
    path: string
    staged: string
  }>()
  const diff = useDiff(params.name, params.folder ?? '', params.path, params.staged === '1')

  const options = useMemo(() => ({ title: getFileName(params.path) }), [params.path])

  return (
    <View style={styles.root}>
      <Stack.Screen options={options} />
      <LinkBanner />
      {diff ? (
        <Diff diff={diff} />
      ) : (
        <View style={styles.center}>
          <Loader />
        </View>
      )}
    </View>
  )
}

const makeStyles = defineStyles((theme) => ({
  root: { flex: 1, backgroundColor: theme.surface.page },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
}))
