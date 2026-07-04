import { Button, Group, Stack, Text, TextInput, Title } from '@mantine/core'
import { useEffect, useState } from 'react'

//Services
import { useTransport } from '@/services/transport/transport-context'

//Store
import { useAppStore } from '@/stores/app-store'

//Components
import { OverlayShell } from '@/shared/overlay-shell'

//Styles
import styles from './settings.module.css'

/** Settings overlay: manage account profiles (isolated per-provider logins). */
export function Settings() {
  const transport = useTransport()
  const accounts = useAppStore((s) => s.accounts)
  const [name, setName] = useState('')

  useEffect(() => {
    transport.send({ type: 'list-accounts' })
  }, [transport])

  const create = () => {
    const account = name.trim()
    if (!account) return
    const dir = `~/.soromi/accounts/${account}/claude`
    transport.send({
      type: 'save-account',
      profile: {
        name: account,
        providers: { claude: { configDir: dir, env: { CLAUDE_CONFIG_DIR: dir } } },
      },
    })
    setName('')
  }

  const remove = (account: string) => {
    if (window.confirm(`Delete account "${account}"? This removes its stored logins.`)) {
      transport.send({ type: 'delete-account', name: account })
    }
  }

  return (
    <OverlayShell header={<span className={styles.title}>Settings</span>}>
      <div className={styles.body}>
        <Stack gap="lg" maw={560}>
          <div>
            <Title order={4}>Accounts</Title>
            <Text c="dimmed" size="sm">
              Isolated logins per provider. To sign one in, open a workspace on the account and run
              its agent's login (e.g. <code>claude login</code>) in the terminal.
            </Text>
          </div>

          <Stack gap="xs">
            {accounts.length === 0 ? (
              <Text c="dimmed" size="sm">
                No accounts yet.
              </Text>
            ) : (
              accounts.map((account) => (
                <Group key={account.name} justify="space-between" className={styles.row}>
                  <div>
                    <Text fw={500}>{account.name}</Text>
                    <Text c="dimmed" size="xs">
                      {Object.keys(account.providers).join(', ') || 'no providers'}
                    </Text>
                  </div>
                  <Button
                    variant="subtle"
                    color="red"
                    size="compact-sm"
                    onClick={() => remove(account.name)}
                  >
                    Delete
                  </Button>
                </Group>
              ))
            )}
          </Stack>

          <Group>
            <TextInput
              flex={1}
              placeholder="account name (e.g. work)"
              value={name}
              onChange={(event) => setName(event.currentTarget.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') create()
              }}
            />
            <Button onClick={create} disabled={!name.trim()}>
              Add account
            </Button>
          </Group>
        </Stack>
      </div>
    </OverlayShell>
  )
}
