import { DEFAULT_ACCOUNT, SETUP_AGENTS, accountChoices, createSpaceMessage } from '@soromi/core'
import { Stack, useRouter } from 'expo-router'
import { useCallback, useMemo, useState } from 'react'
import { ScrollView } from 'react-native'

//Components
import { Button, Input, KeyboardView, ProviderMark, Text } from '@/components'

//Config
import { layout } from '@/config/layout'
import { defineStyles, useThemedStyles } from '@/config/theme'

//Features
import { LinkBanner } from '@/features/layout/components/link-banner'
import { ChoiceField } from '@/features/workspaces/components/choice-field'
import { Field } from '@/features/workspaces/components/field'
import { FoldersField } from '@/features/workspaces/components/folders-field'

//Constants
import { WORKSPACES } from '@/features/workspaces/constants/workspaces'

//Helpers
import { getHeaderTitle } from '@/features/layout/helpers'
import { getAgentChoices, getDefaultName, toChoices } from '@/features/workspaces/helpers'

//Hooks
import { useAccounts } from '@/features/workspaces/hooks/use-accounts'
import { useSpaceRequest } from '@/features/workspaces/hooks/use-space-request'

//State
import { useWorkspaceFolderListing } from '@/states/workspace/workspace.state.hook'

const AGENTS = getAgentChoices()

/**
 * A new workspace on the computer, set up from here: the folders it is made of (picked from the
 * computer's), what it is called, and the agent and account that work in it. A folder that
 * describes a workspace of its own (`soromi.space.json`) can be used as it says instead.
 */
export const NewWorkspaceScreen = () => {
  const styles = useThemedStyles(makeStyles)
  const router = useRouter()
  const profiles = useAccounts()
  const listing = useWorkspaceFolderListing()
  const request = useSpaceRequest()
  const send = request.send
  const copy = WORKSPACES.create

  const [name, setName] = useState('')
  const [folders, setFolders] = useState<string[]>([])
  const [agent, setAgent] = useState<string>(SETUP_AGENTS[0])
  const [account, setAccount] = useState(DEFAULT_ACCOUNT)

  const accounts = useMemo(() => toChoices(accountChoices(profiles, agent)), [profiles, agent])
  // The one folder picked holds a workspace's own description: it can be used as it says.
  const describes = folders.length === 1 && listing?.path === folders[0] && listing.spaceFile

  const handleAgent = useCallback(
    (next: string) => {
      setAgent(next)
      // An account that does not run the new agent goes back to the default.
      if (!accountChoices(profiles, next).includes(account)) setAccount(DEFAULT_ACCOUNT)
    },
    [profiles, account],
  )

  const handleDone = useCallback(() => router.back(), [router])

  const handleCreate = useCallback(() => {
    const message = createSpaceMessage({ name, folders, agent, account })
    if (message) send(message, handleDone)
  }, [name, folders, agent, account, send, handleDone])

  const handleImport = useCallback(() => {
    const dir = folders[0]
    if (dir) send({ type: 'open-workspace', dir }, handleDone)
  }, [folders, send, handleDone])

  const options = useMemo(() => getHeaderTitle(WORKSPACES.create.title), [])
  const mark = useMemo(() => <ProviderMark provider={agent} />, [agent])

  return (
    <KeyboardView style={styles.root}>
      <Stack.Screen options={options} />
      <LinkBanner />
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Text variant="bodySm" tone="muted">
          {copy.about}
        </Text>
        <Field label={copy.folders}>
          <FoldersField folders={folders} onChange={setFolders} />
        </Field>
        {describes && (
          <Field label={copy.importFile} hint={copy.importHint}>
            <Button
              variant="secondary"
              label={copy.importFile}
              disabled={request.pending}
              onPress={handleImport}
            />
          </Field>
        )}
        <Field label={copy.name}>
          <Input
            value={name}
            placeholder={getDefaultName(folders) || copy.namePlaceholder}
            autoCapitalize="none"
            autoCorrect={false}
            onChangeText={setName}
          />
        </Field>
        <Field label={copy.agent}>
          <ChoiceField
            title={copy.agent}
            value={agent}
            choices={AGENTS}
            leading={mark}
            onChange={handleAgent}
          />
        </Field>
        <Field label={copy.account}>
          <ChoiceField
            title={copy.account}
            value={account}
            choices={accounts}
            onChange={setAccount}
          />
        </Field>
        {request.error && (
          <Text variant="bodySm" tone="danger">
            {request.error}
          </Text>
        )}
        <Button
          label={request.pending ? copy.pending : copy.submit}
          disabled={folders.length === 0 || request.pending}
          onPress={handleCreate}
        />
      </ScrollView>
    </KeyboardView>
  )
}

const makeStyles = defineStyles((theme) => ({
  root: { flex: 1, backgroundColor: theme.surface.page },
  // A form is read in a column: on a wide screen it stops growing and sits in the middle.
  content: {
    width: '100%',
    maxWidth: layout.sheet,
    alignSelf: 'center',
    gap: theme.spacing.lg,
    padding: theme.spacing.lg,
  },
}))
