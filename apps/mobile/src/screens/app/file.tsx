import { Stack, useLocalSearchParams } from 'expo-router'
import { useMemo } from 'react'
import { View } from 'react-native'

//Components
import { KeyboardView, Loader } from '@/components'

//Config
import { defineStyles, useThemedStyles } from '@/config/theme'

//Features
import { FileView } from '@/features/files/components/file-view'
import { LinkBanner } from '@/features/layout/components/link-banner'

//Helpers
import { getFileName } from '@/features/files/helpers'

//Hooks
import { useFile } from '@/features/files/hooks/use-file'

/** One file from a workspace: read, and edited in place and saved back to the computer. */
export const FileScreen = () => {
  const styles = useThemedStyles(makeStyles)
  const { name, path } = useLocalSearchParams<{ name: string; path: string }>()
  const file = useFile(name, path)

  const options = useMemo(() => ({ title: getFileName(path) }), [path])

  return (
    <KeyboardView style={styles.root}>
      <Stack.Screen options={options} />
      <LinkBanner />
      {file ? (
        <FileView workspace={name} path={path} file={file} />
      ) : (
        <View style={styles.center}>
          <Loader />
        </View>
      )}
    </KeyboardView>
  )
}

const makeStyles = defineStyles((theme) => ({
  root: { flex: 1, backgroundColor: theme.surface.page },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
}))
