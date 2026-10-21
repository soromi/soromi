import { useEffect, useState } from 'react'

//Packages
import { useTransport } from '@soromi/client'
import { Button, Input, Label, Switch } from '@soromi/ui'

//Styles
import { CARD, DESC, H2, SECTION, SECTION_HEAD } from './styles'

/**
 * Remote (self-host) settings: the relay paired phones connect through. Local-link only.
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

  return (
    <section className={SECTION}>
      <div className={SECTION_HEAD}>
        <div>
          <h2 className={H2}>Remote</h2>
          <p className={DESC}>
            How paired phones reach this computer: directly when they share a network with it, and
            through the relay otherwise. Fill in the relay fields only to self-host it; left blank,
            they use the defaults shown.
          </p>
        </div>
      </div>

      <div className={CARD}>
        <div className="flex items-center justify-between gap-4 p-4">
          <div className="flex flex-col gap-1">
            <Label htmlFor="direct-access">Connect directly on the same network</Label>
            <p className="text-xs text-muted-foreground">
              A paired phone on this computer's Wi-Fi or VPN talks to it straight, without the
              relay, and goes back to the relay when it leaves. The link is end-to-end encrypted
              either way. Opens a port on this computer while a phone is paired.
            </p>
          </div>
          <Switch id="direct-access" checked={direct} onCheckedChange={toggleDirect} />
        </div>
      </div>

      <div className={CARD}>
        <div className="p-4">
          <div className="flex flex-col gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="relay-url">Relay URL</Label>
              <Input
                id="relay-url"
                placeholder={defaults.relayUrl}
                value={relayUrl}
                onChange={(event) => edit(setRelayUrl)(event.target.value)}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="access-key">Relay access key</Label>
              <Input
                id="access-key"
                placeholder={defaults.accessKey}
                value={accessKey}
                onChange={(event) => edit(setAccessKey)(event.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                Must match the relay's RELAY_ACCESS_KEY. Only your daemon presents it; paired phones
                never see it.
              </p>
            </div>
            <div className="mt-1 flex items-center gap-3">
              <Button onClick={save}>Save</Button>
              {saved && <span className="text-[13px] text-[var(--soromi-accent)]">Saved</span>}
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
