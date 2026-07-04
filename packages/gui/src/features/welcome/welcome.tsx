import { Alert, Button, Group, Stack, Text, TextInput, Title } from '@mantine/core'
import { useState } from 'react'
import { useShallow } from 'zustand/react/shallow'

//Services
import { useTransport } from '@/services/transport/transport-context'

//Store
import { useAppStore } from '@/stores/app-store'

//Components
import { OverlayShell } from '@/shared/overlay-shell'

//Styles
import styles from './welcome.module.css'

/** The create-space form: pick a work folder, choose its agent and account. */
function CreateSpaceForm() {
  const transport = useTransport()
  const { error, setError } = useAppStore(
    useShallow((s) => ({ error: s.error, setError: s.setError })),
  )
  const [folder, setFolder] = useState('')
  const [name, setName] = useState('')
  const [agent, setAgent] = useState('claude')
  const [account, setAccount] = useState('personal')

  const root = folder.trim()

  const create = () => {
    if (!root) return
    setError(null)
    transport.send({
      type: 'create-space',
      name: name.trim() || basename(root),
      root,
      agent: agent.trim() || 'claude',
      account: account.trim() || 'personal',
    })
  }

  const importFile = () => {
    if (!root) return
    setError(null)
    transport.send({ type: 'open-workspace', dir: root })
  }

  return (
    <Stack gap="md" className={styles.form}>
      <Title order={2}>New workspace</Title>
      <Text c="dimmed">
        Pick a work folder and choose its agent and account. Nothing is written to the folder.
      </Text>
      <TextInput
        label="Folder"
        placeholder="/path/to/folder"
        value={folder}
        onChange={(event) => setFolder(event.currentTarget.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter') create()
        }}
      />
      <TextInput
        label="Name"
        placeholder={root ? basename(root) : 'workspace name'}
        value={name}
        onChange={(event) => setName(event.currentTarget.value)}
      />
      <Group grow>
        <TextInput
          label="Agent"
          value={agent}
          onChange={(event) => setAgent(event.currentTarget.value)}
        />
        <TextInput
          label="Account"
          value={account}
          onChange={(event) => setAccount(event.currentTarget.value)}
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
      <CreateSpaceForm />
    </div>
  )
}

/** Create-space as an overlay on top of a running workspace. */
export function CreateSpaceOverlay() {
  return (
    <OverlayShell>
      <div className={styles.center}>
        <CreateSpaceForm />
      </div>
    </OverlayShell>
  )
}

function basename(path: string): string {
  return path.replace(/\/+$/, '').split('/').pop() ?? path
}
