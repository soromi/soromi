import { Stack, useLocalSearchParams, useRouter } from 'expo-router'
import { useCallback, useEffect, useMemo } from 'react'
import { View } from 'react-native'

//Components
import { IconButton, Text } from '@/components'

//Config
import { defineStyles, useThemedStyles } from '@/config/theme'

//Features
import { ControlBar } from '@/features/layout/components/control-bar'
import { LinkBanner } from '@/features/layout/components/link-banner'
import { ViewToggle } from '@/features/sessions/components/view-toggle'
import { WorkspaceSessions } from '@/features/sessions/components/workspace-sessions'

//Constants
import { SESSIONS } from '@/features/sessions/constants/sessions'

//Helpers
import { getHeaderActions, getHeaderTitle } from '@/features/layout/helpers'
import { getWorkspaceSettingsHref } from '@/features/sessions/helpers'

//State
import { useDaemonWorkspace } from '@/states/daemon/daemon.state.hook'
import { useWorkspaceRenamedTo } from '@/states/workspace/workspace.state.hook'

/**
 * One workspace, from the home: what can be done in it at the top (start a session, carry on an
 * earlier one, its usage), then its sessions, live. The header has the switch between rows and
 * cards, and the workspace's settings.
 */
export const WorkspaceScreen = () => {
  const styles = useThemedStyles(makeStyles)
  const router = useRouter()
  const params = useLocalSearchParams<{ name: string }>()
  const name = params.name
  const workspace = useDaemonWorkspace(name)
  const renamed = useWorkspaceRenamedTo(name)

  // Renamed from its settings, on top of this screen: it follows the workspace to its new name.
  useEffect(() => {
    if (renamed && !workspace) router.setParams({ name: renamed })
  }, [renamed, workspace, router])

  const handleSettings = useCallback(
    () => router.push(getWorkspaceSettingsHref(name)),
    [router, name],
  )

  const renderActions = useCallback(
    () => (
      <View style={styles.actions}>
        <ViewToggle />
        <IconButton icon="settings" label={SESSIONS.group.settings} onPress={handleSettings} />
      </View>
    ),
    [styles, handleSettings],
  )

  const options = useMemo(
    () => ({ ...getHeaderTitle(name), ...getHeaderActions(renderActions) }),
    [name, renderActions],
  )

  return (
    <View style={styles.root}>
      <Stack.Screen options={options} />
      <LinkBanner />
      <ControlBar />
      {workspace ? (
        <WorkspaceSessions workspace={workspace} />
      ) : (
        <Text variant="bodySm" tone="muted" style={styles.missing}>
          {SESSIONS.workspace.missing}
        </Text>
      )}
    </View>
  )
}

const makeStyles = defineStyles((theme) => ({
  root: { flex: 1, backgroundColor: theme.surface.page },
  actions: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm2 },
  missing: { padding: theme.spacing.xl, textAlign: 'center' },
}))
