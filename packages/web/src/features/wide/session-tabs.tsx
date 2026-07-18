import { Menu } from '@mantine/core'
import { useMemo } from 'react'

//Packages
import { useTransport } from '@soromi/client'
import { ProviderIcon, SessionTabs as SessionTabsView } from '@soromi/ui'

//Store
import { useUiStore } from '@/stores/ui-store'

//Styles
import styles from './session-tabs.module.css'

//Types
import type { WorkspaceInfo } from '@soromi/client'
import type { SessionTab } from '@soromi/ui'

/** A readable name for an agent id. */
const agentLabel = (agent: string) =>
  ({ claude: 'Claude', codex: 'Codex' })[agent] ?? agent.charAt(0).toUpperCase() + agent.slice(1)

/** The active workspace's session tabs, above the terminal in the wide layout. */
export function SessionTabs({ workspace }: { workspace: WorkspaceInfo }) {
  const transport = useTransport()
  const activeSession = useUiStore((s) => s.activeSession[workspace.name])
  const selectSession = useUiStore((s) => s.selectSession)

  const tabs = useMemo<SessionTab[]>(
    () =>
      workspace.sessions.map((session) => ({
        id: session.id,
        label: session.title ?? session.account,
        status: session.status,
        agent: session.agent,
        title: session.title ?? null,
        account: session.account,
        canClose: workspace.sessions.length > 1,
      })),
    [workspace.sessions],
  )

  // The agents already bound in this workspace: a new session reuses one (and its account).
  const agents = useMemo(
    () => [...new Set(workspace.accounts.map((a) => a.agent))],
    [workspace.accounts],
  )

  const openTab = (agent: string) =>
    transport.send({ type: 'open-session', workspace: workspace.name, agent })

  const newSession =
    agents.length > 0 ? (
      <Menu position="bottom-start" width={160}>
        <Menu.Target>
          <button type="button" className={styles.newTab} title="New session">
            +
          </button>
        </Menu.Target>
        <Menu.Dropdown>
          <Menu.Label>New session</Menu.Label>
          {agents.map((agent) => (
            <Menu.Item
              key={agent}
              leftSection={<ProviderIcon provider={agent} size={14} />}
              onClick={() => openTab(agent)}
            >
              {agentLabel(agent)}
            </Menu.Item>
          ))}
        </Menu.Dropdown>
      </Menu>
    ) : undefined

  return (
    <SessionTabsView
      tabs={tabs}
      activeId={activeSession}
      onSelect={(id) => selectSession(workspace.name, id)}
      onRename={(id, title) => transport.send({ type: 'rename-session', session: id, title })}
      onClose={(id) => transport.send({ type: 'close-session', session: id })}
      renderIcon={(agent) => <ProviderIcon provider={agent} size={16} />}
      trailing={newSession}
    />
  )
}
