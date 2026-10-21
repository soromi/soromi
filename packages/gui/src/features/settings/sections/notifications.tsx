//Packages
import { useClientStore, useTransport } from '@soromi/client'
import { Switch } from '@soromi/ui'

//Components
import { SettingsGroup, SettingsPage, SettingsRow } from '../layout'

/**
 * Which workspaces notify: one switch each. What is said is the computer's (each workspace's
 * `muted`), so this, the sidebar's menu and the phone always agree.
 */
export function NotificationsSection() {
  const transport = useTransport()
  const workspaces = useClientStore((s) => s.workspaces)
  const setMuted = useClientStore((s) => s.setMuted)

  const toggle = (workspace: string, notify: boolean) => {
    setMuted(workspace, !notify)
    transport.send({ type: 'mute-workspace', workspace, muted: !notify })
  }

  return (
    <SettingsPage
      title="Notifications"
      description="A banner and a sound when a session finishes, or needs you to answer it."
    >
      <SettingsGroup
        label="Workspaces"
        hint="A muted workspace is silent here and on your paired phones. They come back on with it."
      >
        {workspaces.length === 0 && (
          <div className="px-4 py-6 text-center text-[12.5px] text-[var(--soromi-text-faint)]">
            No workspaces yet.
          </div>
        )}
        {workspaces.map((workspace) => (
          <SettingsRow
            key={workspace.name}
            title={workspace.name}
            description={
              workspace.muted
                ? 'Muted'
                : `${workspace.sessions.length} ${workspace.sessions.length === 1 ? 'session' : 'sessions'}`
            }
            control={
              <Switch
                checked={!workspace.muted}
                onCheckedChange={(notify) => toggle(workspace.name, notify)}
                aria-label={`Notifications for ${workspace.name}`}
              />
            }
          />
        ))}
      </SettingsGroup>
    </SettingsPage>
  )
}
