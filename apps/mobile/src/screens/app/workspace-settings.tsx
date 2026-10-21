import { settingsAgents, updateSpaceMessage } from '@soromi/core'
import { Stack, useLocalSearchParams, useRouter } from 'expo-router'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Alert, ScrollView, View } from 'react-native'

//Components
import { ActionRow, Card, Input, KeyboardView, Segmented, Text } from '@/components'

//Config
import { layout } from '@/config/layout'
import { defineStyles, useThemedStyles } from '@/config/theme'

//Features
import { LinkBanner } from '@/features/layout/components/link-banner'
import { AgentAccounts } from '@/features/workspaces/components/agent-accounts'
import { Field } from '@/features/workspaces/components/field'
import { FoldersField } from '@/features/workspaces/components/folders-field'
import { SaveBar } from '@/features/workspaces/components/save-bar'
import { SwitchRow } from '@/features/workspaces/components/switch-row'

//Constants
import { WORKSPACES } from '@/features/workspaces/constants/workspaces'

//Helpers
import { getHeaderTitle } from '@/features/layout/helpers'
import {
  getSpareAccounts,
  isEdited,
  toWorkspaceEdit,
  withAccount,
  withoutAccount,
} from '@/features/workspaces/helpers'

//Hooks
import { useAccounts } from '@/features/workspaces/hooks/use-accounts'
import { useExport } from '@/features/workspaces/hooks/use-export'
import { useSpaceRequest } from '@/features/workspaces/hooks/use-space-request'

//Services
import { LinkService } from '@/services/link'

//State
import { useDaemonWorkspace } from '@/states/daemon/daemon.state.hook'
import { useWorkspaceActions } from '@/states/workspace/workspace.state.hook'

//Type
import type { WorkspaceEdit } from '@soromi/core'
import type { SettingsTab } from '@/features/workspaces/types'

/**
 * A workspace's own settings, as the desktop has them, in three parts: what it is (its name, its
 * folders, whether it notifies), the agents (the accounts each runs under, and what they are all
 * told), and what is done to it (export, remove). What is edited is kept here, across the parts,
 * until it is saved from the bar that shows while there is something to save. Notifications,
 * export and remove take effect at once. App-wide settings (account profiles, the relay,
 * keep-awake) stay on the desktop.
 */
export const WorkspaceSettingsScreen = () => {
  const styles = useThemedStyles(makeStyles)
  const router = useRouter()
  const params = useLocalSearchParams<{ name: string }>()
  const workspace = params.name
  const summary = useDaemonWorkspace(workspace)
  const profiles = useAccounts()
  const request = useSpaceRequest()
  const send = request.send
  const exporter = useExport(workspace)
  const workspaceActions = useWorkspaceActions()
  const copy = WORKSPACES.settings
  const [tab, setTab] = useState<SettingsTab>('general')

  const agents = useMemo(() => settingsAgents(summary), [summary])
  // How the workspace was when the screen opened, or last saved: what edits are compared to.
  const [start, setStart] = useState<WorkspaceEdit | null>(() =>
    summary ? toWorkspaceEdit(summary, workspace, agents) : null,
  )
  const [name, setName] = useState(start?.name ?? workspace)
  const [folders, setFolders] = useState(start?.folders ?? [])
  const [instructions, setInstructions] = useState(start?.instructions ?? '')
  const [bindings, setBindings] = useState<Record<string, string[]>>(start?.bindings ?? {})

  // Opened before the computer had listed it (a link from a banner): it starts from what the list
  // says, once it says it.
  useEffect(() => {
    if (start || !summary) return
    const first = toWorkspaceEdit(summary, workspace, agents)
    setStart(first)
    setName(first.name)
    setFolders(first.folders)
    setInstructions(first.instructions)
    setBindings(first.bindings)
  }, [start, summary, workspace, agents])

  // Each agent with the accounts it runs under and the ones it could besides.
  const rows = useMemo(
    () =>
      agents.map((agent) => {
        const chosen = bindings[agent] ?? []

        return { agent, chosen, spare: getSpareAccounts(profiles, agent, chosen) }
      }),
    [agents, bindings, profiles],
  )

  const edit = useMemo(
    () => ({ name, folders, bindings, instructions }),
    [name, folders, bindings, instructions],
  )
  const edited = start !== null && isEdited(start, edit)

  const handleAdd = useCallback(
    (agent: string, account: string) =>
      setBindings((current) => withAccount(current, agent, account)),
    [],
  )
  const handleRemove = useCallback(
    (agent: string, account: string) =>
      setBindings((current) => withoutAccount(current, agent, account)),
    [],
  )

  const handleSave = useCallback(() => {
    if (!summary) return
    send(updateSpaceMessage(summary, edit, profiles), (renamed) => {
      // What is saved is what later edits are compared to.
      setStart({ ...edit, name: renamed })
      setName(renamed)
      // Renamed: the screen follows it under its new name, and so does the workspace's own screen
      // under it.
      if (renamed !== workspace) {
        workspaceActions.setRenamed(workspace, renamed)
        router.setParams({ name: renamed })
      }
    })
  }, [summary, edit, profiles, send, workspace, router, workspaceActions])

  const handleDiscard = useCallback(() => {
    if (!start) return
    setName(start.name)
    setFolders(start.folders)
    setInstructions(start.instructions)
    setBindings(start.bindings)
  }, [start])

  const handleTab = useCallback((id: string) => setTab(id as SettingsTab), [])

  const handleNotify = useCallback(
    (on: boolean) => LinkService.send({ type: 'mute-workspace', workspace, muted: !on }),
    [workspace],
  )

  const handleRemoveWorkspace = useCallback(
    () =>
      Alert.alert(WORKSPACES.settings.confirm.title, WORKSPACES.settings.confirm.message, [
        { text: WORKSPACES.settings.confirm.cancel, style: 'cancel' },
        {
          text: WORKSPACES.settings.confirm.confirm,
          style: 'destructive',
          onPress: () => {
            LinkService.send({ type: 'remove-space', workspace })
            if (router.canDismiss()) router.dismissAll()
          },
        },
      ]),
    [workspace, router],
  )

  const options = useMemo(() => getHeaderTitle(workspace), [workspace])

  if (!summary) {
    return (
      <KeyboardView style={styles.root}>
        <Stack.Screen options={options} />
        <Text variant="bodySm" tone="muted" style={styles.missing}>
          {copy.missing}
        </Text>
      </KeyboardView>
    )
  }

  return (
    <KeyboardView style={styles.root}>
      <Stack.Screen options={options} />
      <LinkBanner />
      <View style={styles.tabs}>
        <Segmented options={copy.tabs} value={tab} onChange={handleTab} />
      </View>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        {tab === 'general' && (
          <>
            <Field label={copy.name}>
              <Input
                value={name}
                autoCapitalize="none"
                autoCorrect={false}
                onChangeText={setName}
              />
            </Field>
            <Field label={copy.folders} hint={copy.foldersHint}>
              <FoldersField folders={folders} onChange={setFolders} />
            </Field>
            <Field label={copy.notifications}>
              <Card>
                <SwitchRow
                  label={copy.notify}
                  hint={copy.notifyHint}
                  value={!summary.muted}
                  onChange={handleNotify}
                />
              </Card>
            </Field>
          </>
        )}
        {tab === 'agents' && (
          <>
            <Field label={copy.agents} hint={copy.agentsHint}>
              {rows.map((row) => (
                <AgentAccounts
                  key={row.agent}
                  agent={row.agent}
                  chosen={row.chosen}
                  spare={row.spare}
                  onAdd={handleAdd}
                  onRemove={handleRemove}
                />
              ))}
            </Field>
            <Field label={copy.instructions} hint={copy.instructionsHint}>
              <Input
                multiline
                value={instructions}
                placeholder={copy.instructionsPlaceholder}
                style={styles.instructions}
                onChangeText={setInstructions}
              />
            </Field>
          </>
        )}
        {tab === 'advanced' && (
          <>
            <Field
              label={copy.share}
              hint={exporter.path ? copy.exported(exporter.path) : copy.exportHint}
            >
              <Card>
                <ActionRow icon="file-text" label={copy.export} onPress={exporter.handleExport} />
              </Card>
            </Field>
            <Field label={copy.danger} hint={copy.removeHint}>
              <Card>
                <ActionRow
                  icon="trash"
                  tone="danger"
                  label={copy.remove}
                  onPress={handleRemoveWorkspace}
                />
              </Card>
            </Field>
          </>
        )}
      </ScrollView>
      {(edited || request.pending) && (
        <SaveBar
          pending={request.pending}
          error={request.error}
          valid={folders.length > 0}
          onSave={handleSave}
          onDiscard={handleDiscard}
        />
      )}
    </KeyboardView>
  )
}

const makeStyles = defineStyles((theme) => ({
  root: { flex: 1, backgroundColor: theme.surface.page },
  // Settings are read in a column: on a wide screen it stops growing and sits in the middle.
  tabs: {
    width: '100%',
    maxWidth: layout.sheet,
    alignSelf: 'center',
    paddingHorizontal: theme.spacing.lg,
    paddingTop: theme.spacing.sm,
    paddingBottom: theme.spacing.sm2,
  },
  content: {
    width: '100%',
    maxWidth: layout.sheet,
    alignSelf: 'center',
    gap: theme.spacing.lg,
    paddingHorizontal: theme.spacing.lg,
    paddingTop: theme.spacing.sm,
    paddingBottom: theme.spacing.xl,
  },
  instructions: { minHeight: 120, textAlignVertical: 'top' },
  missing: { padding: theme.spacing.lg, textAlign: 'center' },
}))
