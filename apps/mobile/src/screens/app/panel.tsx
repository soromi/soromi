import { Stack, useLocalSearchParams } from 'expo-router'
import { useMemo, useState } from 'react'

//Components
import { KeyboardView } from '@/components'

//Config
import { defineStyles, useThemedStyles } from '@/config/theme'

//Features
import { LinkBanner } from '@/features/layout/components/link-banner'
import { PanelTabs } from '@/features/panel/components/tabs'

//Helpers
import { getHeaderActions, getHeaderTitle } from '@/features/layout/helpers'
import { toPanelView } from '@/features/panel/helpers'

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
  const params = useLocalSearchParams<{ id: string; view?: string }>()
  const id = params.id
  const workspace = useDaemonWorkspaceName(id)
  // Opened on the view whose icon was tapped; its own header moves between them from there.
  const [view, setView] = useState(() => toPanelView(params.view))

  const options = useMemo(
    () => ({
      ...getHeaderTitle(workspace ?? ''),
      ...getHeaderActions(() => <PanelTabs active={view} onSelect={setView} />),
    }),
    [workspace, view],
  )

  return (
    // A terminal is typed into: it stays above the keyboard.
    <KeyboardView style={styles.root}>
      <Stack.Screen options={options} />
      <LinkBanner />
      <PanelBody session={id} view={view} />
    </KeyboardView>
  )
}

const makeStyles = defineStyles((theme) => ({
  root: { flex: 1, backgroundColor: theme.surface.page },
}))
