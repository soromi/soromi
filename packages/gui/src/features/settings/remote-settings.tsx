import { Button, Stack, TextInput } from '@mantine/core'
import { useEffect, useState } from 'react'

//Packages
import { useTransport } from '@soromi/client'

//Styles
import styles from './settings.module.css'

/**
 * Remote (self-host) settings: the relay + web-viewport URLs paired phones use. Local-link only.
 * Editable at runtime so a bundled app never needs a rebuild to point at a different relay / host.
 * Reads the current values on mount and applies changes live on the daemon.
 */
export function RemoteSettings() {
  const transport = useTransport()
  const [relayUrl, setRelayUrl] = useState('')
  const [webUrl, setWebUrl] = useState('')
  const [accessKey, setAccessKey] = useState('')
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    const off = transport.onMessage((message) => {
      if (message.type === 'remote-config') {
        setRelayUrl(message.config.relayUrl)
        setWebUrl(message.config.webUrl)
        setAccessKey(message.config.accessKey)
      }
    })
    transport.send({ type: 'get-remote-config' })

    return off
  }, [transport])

  const save = () => {
    transport.send({
      type: 'set-remote-config',
      config: { relayUrl: relayUrl.trim(), webUrl: webUrl.trim(), accessKey: accessKey.trim() },
    })
    setSaved(true)
  }
  const edit = (setter: (value: string) => void) => (value: string) => {
    setter(value)
    setSaved(false)
  }

  return (
    <section className={styles.section}>
      <div className={styles.sectionHead}>
        <div>
          <h2 className={styles.h2}>Remote</h2>
          <p className={styles.desc}>
            Where paired phones connect. Change these to self-host the relay or the web app; no
            rebuild needed. Leave blank to use the defaults.
          </p>
        </div>
      </div>

      <div className={styles.card}>
        <div className={styles.remoteForm}>
          <Stack gap="sm">
            <TextInput
              label="Relay URL"
              placeholder="ws://localhost:8787"
              value={relayUrl}
              onChange={(event) => edit(setRelayUrl)(event.currentTarget.value)}
            />
            <TextInput
              label="Web app URL"
              placeholder="http://localhost:1430"
              value={webUrl}
              onChange={(event) => edit(setWebUrl)(event.currentTarget.value)}
            />
            <TextInput
              label="Relay access key"
              description="Must match the relay's RELAY_ACCESS_KEY. Only your daemon presents it; paired phones never see it."
              placeholder="soromi"
              value={accessKey}
              onChange={(event) => edit(setAccessKey)(event.currentTarget.value)}
            />
            <div className={styles.remoteActions}>
              <Button onClick={save}>Save</Button>
              {saved && <span className={styles.remoteSaved}>Saved</span>}
            </div>
          </Stack>
        </div>
      </div>
    </section>
  )
}
