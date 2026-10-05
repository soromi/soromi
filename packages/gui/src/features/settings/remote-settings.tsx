import { useEffect, useState } from 'react'

//Packages
import { useTransport } from '@soromi/client'
import { Button, Input, Label } from '@soromi/ui'

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
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    const off = transport.onMessage((message) => {
      if (message.type === 'remote-config') {
        setRelayUrl(message.config.relayUrl)
        setAccessKey(message.config.accessKey)
      }
    })
    transport.send({ type: 'get-remote-config' })

    return off
  }, [transport])

  const save = () => {
    transport.send({
      type: 'set-remote-config',
      config: { relayUrl: relayUrl.trim(), accessKey: accessKey.trim() },
    })
    setSaved(true)
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
            Where paired phones connect. Change these to self-host the relay; no rebuild needed.
            Leave blank to use the defaults.
          </p>
        </div>
      </div>

      <div className={CARD}>
        <div className="p-4">
          <div className="flex flex-col gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="relay-url">Relay URL</Label>
              <Input
                id="relay-url"
                placeholder="wss://relay.soromi.dev"
                value={relayUrl}
                onChange={(event) => edit(setRelayUrl)(event.target.value)}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="access-key">Relay access key</Label>
              <Input
                id="access-key"
                placeholder="soromi"
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
