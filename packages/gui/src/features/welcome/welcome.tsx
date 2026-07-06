import {
  ActionIcon,
  Alert,
  Anchor,
  Button,
  Group,
  Select,
  Stack,
  Text,
  TextInput,
  Title,
} from '@mantine/core'
import { open } from '@tauri-apps/plugin-dialog'
import { useEffect, useMemo, useState } from 'react'
import { useShallow } from 'zustand/react/shallow'

//Services
import { useTransport } from '@/services/transport/transport-context'

//Store
import { useAppStore } from '@/stores/app-store'

//Utils
import { basename, deriveRootAndFolders } from './folders'

//Constants
import { isTauri } from '@/config'
import { PROVIDERS } from '@/config/providers'

//Components
import { OverlayShell } from '@/shared/overlay-shell'
import { ProviderIcon } from '@/shared/provider-icon'

//Styles
import styles from './welcome.module.css'

/** The create-space form: pick work folders, choose an agent and account. */
function CreateSpaceForm({ heading }: { heading?: boolean }) {
  const transport = useTransport()
  const { error, setError, accounts, openSettings } = useAppStore(
    useShallow((s) => ({
      error: s.error,
      setError: s.setError,
      accounts: s.accounts,
      openSettings: s.openSettings,
    })),
  )
  const [folderInputs, setFolderInputs] = useState<string[]>([''])
  const [name, setName] = useState('')
  const [agent, setAgent] = useState('claude')
  const [account, setAccount] = useState('personal')

  useEffect(() => {
    transport.send({ type: 'list-accounts' })
  }, [transport])

  const { root, folders } = useMemo(() => deriveRootAndFolders(folderInputs), [folderInputs])

  // Only accounts with a login configured for the chosen agent's provider, plus `personal`.
  const accountOptions = useMemo(
    () =>
      [
        ...new Set([
          'personal',
          ...accounts.filter((a) => agent in a.providers).map((a) => a.name),
        ]),
      ].map((n) => ({ value: n, label: n })),
    [accounts, agent],
  )

  const updateFolder = (index: number, value: string) =>
    setFolderInputs((rows) => rows.map((row, i) => (i === index ? value : row)))
  const addFolder = () => setFolderInputs((rows) => [...rows, ''])
  const removeFolder = (index: number) =>
    setFolderInputs((rows) => (rows.length > 1 ? rows.filter((_, i) => i !== index) : ['']))

  const pickFolder = async (index: number) => {
    const selected = await open({ directory: true, multiple: false, title: 'Pick a work folder' })
    if (typeof selected === 'string') updateFolder(index, selected)
  }

  const create = () => {
    if (!root) return
    setError(null)
    const isWhole = folders.length === 1 && folders[0] === '.'
    transport.send({
      type: 'create-space',
      name: name.trim() || basename(root),
      root,
      agent: agent.trim() || 'claude',
      account: account.trim() || 'personal',
      folders: isWhole ? undefined : folders,
    })
  }

  const importFile = () => {
    if (!root) return
    setError(null)
    transport.send({ type: 'open-workspace', dir: root })
  }

  return (
    <Stack gap="md" className={styles.form}>
      {heading && <Title order={2}>New workspace</Title>}
      <Text c="dimmed">
        Pick one or more work folders and choose an agent and account. Nothing is written to the
        folder.
      </Text>

      <TextInput
        label="Name"
        placeholder={root ? basename(root) : 'workspace name'}
        value={name}
        onChange={(event) => setName(event.currentTarget.value)}
      />

      <div>
        <Text component="label" size="sm" fw={500} mb={4} display="block">
          Folders
        </Text>
        <Stack gap="xs">
          {folderInputs.map((folder, index) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: rows are positional and stable.
            <Group key={index} gap="xs" wrap="nowrap">
              <TextInput
                flex={1}
                placeholder="/path/to/folder"
                value={folder}
                onChange={(event) => updateFolder(index, event.currentTarget.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') create()
                }}
              />
              {isTauri && (
                <Button variant="default" size="sm" onClick={() => pickFolder(index)}>
                  Pick
                </Button>
              )}
              {folderInputs.length > 1 && (
                <ActionIcon
                  variant="subtle"
                  color="gray"
                  aria-label="Remove folder"
                  onClick={() => removeFolder(index)}
                >
                  ✕
                </ActionIcon>
              )}
            </Group>
          ))}
          <Group>
            <Button variant="subtle" size="compact-sm" onClick={addFolder}>
              Add folder
            </Button>
          </Group>
        </Stack>
      </div>

      <Group grow align="flex-start">
        <Select
          label="Agent"
          data={PROVIDERS}
          value={agent}
          onChange={(value) => value && setAgent(value)}
          allowDeselect={false}
          leftSection={<ProviderIcon provider={agent} />}
          renderOption={({ option }) => (
            <Group gap="xs" wrap="nowrap">
              <ProviderIcon provider={option.value} />
              <span>{option.label}</span>
            </Group>
          )}
        />
        <Select
          label={
            <span className={styles.accountLabel}>
              Account
              <Anchor component="button" type="button" size="sm" onClick={openSettings}>
                New account
              </Anchor>
            </span>
          }
          labelProps={{ style: { display: 'block' } }}
          data={accountOptions}
          value={account}
          onChange={(value) => value && setAccount(value)}
          allowDeselect={false}
        />
      </Group>
      {error && (
        <Alert color="red" variant="light">
          {error}
        </Alert>
      )}
      <Button onClick={create} disabled={!root}>
        Create workspace
      </Button>
      <Button variant="subtle" size="compact-sm" onClick={importFile} disabled={!root}>
        Import a soromi.space.json from this folder
      </Button>
    </Stack>
  )
}

/** Base view shown when there is no active workspace (first run). */
export function Welcome() {
  return (
    <div className={styles.center}>
      <CreateSpaceForm heading />
    </div>
  )
}

/** Create-space as an overlay on top of a running workspace. */
export function CreateSpaceOverlay() {
  return (
    <OverlayShell title="New workspace">
      <div className={styles.center}>
        <CreateSpaceForm />
      </div>
    </OverlayShell>
  )
}
