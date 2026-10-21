import { useEffect, useState } from 'react'

//Packages
import { useTransport } from '@soromi/client'
import { Switch } from '@soromi/ui'

//Components
import {
  SETTINGS_FIELD,
  SETTINGS_PRIMARY,
  SettingsGroup,
  SettingsPage,
  SettingsRow,
} from './layout'

/**
 * Remote settings: the relay paired phones connect through (a Cloudflare Worker of your own, or
 * the default). Local-link only.
 * Editable at runtime so a bundled app never needs a rebuild to point at a different relay.
 * Reads the current values on mount and applies changes live on the daemon.
 */
export function RemoteSettings() {
  const transport = useTransport()
  const [relayUrl, setRelayUrl] = useState('')
  const [accessKey, setAccessKey] = useState('')
  const [direct, setDirect] = useState(true)
  // What the relay settings are on the daemon: sent back unchanged with the direct switch, so
  // flipping it never saves what is half-typed in the fields.
  const [stored, setStored] = useState({ relayUrl: '', accessKey: '' })
  // What an empty field means, shown in its place.
  const [defaults, setDefaults] = useState({ relayUrl: '', accessKey: '' })
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    const off = transport.onMessage((message) => {
      if (message.type === 'remote-config') {
        // Only what was overridden comes back; a setting left alone is an empty field.
        setRelayUrl(message.config.relayUrl)
        setAccessKey(message.config.accessKey)
        setDirect(message.config.direct)
        setStored({ relayUrl: message.config.relayUrl, accessKey: message.config.accessKey })
        setDefaults(message.defaults)
      }
    })
    transport.send({ type: 'get-remote-config' })

    return off
  }, [transport])

  const save = () => {
    transport.send({
      type: 'set-remote-config',
      config: { relayUrl: relayUrl.trim(), accessKey: accessKey.trim(), direct },
    })
    setStored({ relayUrl: relayUrl.trim(), accessKey: accessKey.trim() })
    setSaved(true)
  }
  // Applied at once, with the relay settings as the daemon has them: it is a switch, not a field
  // to fill in and then save.
  const toggleDirect = (next: boolean) => {
    setDirect(next)
    transport.send({ type: 'set-remote-config', config: { ...stored, direct: next } })
  }
  const edit = (setter: (value: string) => void) => (value: string) => {
    setter(value)
    setSaved(false)
  }

  const dirty = relayUrl.trim() !== stored.relayUrl || accessKey.trim() !== stored.accessKey

  return (
    <SettingsPage
      title="Remote"
      description="How paired phones reach this computer: straight to it on a network they share, and through the relay from anywhere else. End-to-end encrypted either way."
    >
      <SettingsGroup label="Nearby">
        <SettingsRow
          title="Connect directly on the same network"
          description="A phone on this computer's Wi-Fi or VPN skips the relay, and goes back to it when it leaves. Opens a port while a phone is paired."
          control={
            <Switch
              id="direct-access"
              checked={direct}
              onCheckedChange={toggleDirect}
              aria-label="Connect directly on the same network"
            />
          }
        />
      </SettingsGroup>

      <SettingsGroup
        label="Relay"
        hint="Leave these empty to use the defaults shown. The access key must match your relay Worker's RELAY_ACCESS_KEY secret; only this computer presents it, and phones never see it."
      >
        <SettingsRow
          title="Relay URL"
          description="Phones that move to it are told when they next connect."
          control={
            <input
              id="relay-url"
              aria-label="Relay URL"
              className={SETTINGS_FIELD}
              placeholder={defaults.relayUrl}
              value={relayUrl}
              onChange={(event) => edit(setRelayUrl)(event.target.value)}
            />
          }
        />
        <SettingsRow
          title="Access key"
          description="What lets this computer open rooms on the relay."
          control={
            <input
              id="access-key"
              type="password"
              aria-label="Relay access key"
              autoComplete="off"
              className={SETTINGS_FIELD}
              placeholder={defaults.accessKey ? '••••••' : ''}
              value={accessKey}
              onChange={(event) => edit(setAccessKey)(event.target.value)}
            />
          }
        />
        <div className="flex items-center justify-end gap-3 px-4 py-2.5">
          {saved && !dirty && (
            <span className="text-[12px] text-[var(--soromi-accent)]">Saved</span>
          )}
          <button type="button" className={SETTINGS_PRIMARY} disabled={!dirty} onClick={save}>
            Save
          </button>
        </div>
      </SettingsGroup>
    </SettingsPage>
  )
}
