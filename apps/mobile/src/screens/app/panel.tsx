import { Stack, useLocalSearchParams } from 'expo-router'
import { useMemo } from 'react'

//Components
import { KeyboardView } from '@/components'

//Config
import { defineStyles, useThemedStyles } from '@/config/theme'

//Features
import { LinkBanner } from '@/features/layout/components/link-banner'

//Screens
import { PanelBody } from '@/screens/shared/panel-body'

//State
import { useDaemonWorkspaceName } from '@/states/daemon/daemon.state.hook'

/**
 * A session's panel as a screen of its own, which is how a phone shows it: the files of its
 * workspace, its commands and skills, the workspace's uncommitted changes, and terminals in it.
 */
export const PanelScreen = () => {
  const styles = useThemedStyles(makeStyles)
  const { id } = useLocalSearchParams<{ id: string }>()
  const workspace = useDaemonWorkspaceName(id)

  const options = useMemo(() => ({ title: workspace ?? '' }), [workspace])

  return (
    // A terminal is typed into: it stays above the keyboard.
    <KeyboardView style={styles.root}>
      <Stack.Screen options={options} />
      <LinkBanner />
      <PanelBody session={id} />
    </KeyboardView>
  )
}

const makeStyles = defineStyles((theme) => ({
  root: { flex: 1, backgroundColor: theme.surface.page },
}))
