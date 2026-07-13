import { Button, TextInput } from '@mantine/core'
import { useEffect, useState } from 'react'

//Packages
import { useTransport } from '@soromi/client'

//Components
import { OverlayShell } from '@/shared/overlay-shell'
import { QrCode } from './qr-code'

//Styles
import styles from './connect-phone.module.css'

//Types
import type { DeviceSummary } from '@soromi/protocol'

/**
 * "Connect a phone": names a device, asks the daemon to pair it, and shows the resulting QR to
 * scan. Scanning opens the web viewport already configured with this device's relay, room, and
 * end-to-end key. Each pairing is its own device (revoke them in Settings).
 */
export function ConnectPhone() {
  const transport = useTransport()
  const [name, setName] = useState('My phone')
  const [device, setDevice] = useState<DeviceSummary | null>(null)

  useEffect(() => {
    const off = transport.onMessage((message) => {
      if (message.type === 'device-paired') setDevice(message.device)
    })

    return off
  }, [transport])

  const pair = () => {
    setDevice(null)
    transport.send({ type: 'create-device', name: name.trim() || 'Phone' })
  }

  return (
    <OverlayShell title="Connect a phone">
      <div className={styles.body}>
        {device === null ? (
          <div className={styles.form}>
            <p className={styles.lead}>
              Name this device, then scan the code with your phone's camera to open Soromi on it.
            </p>
            <TextInput
              label="Device name"
              value={name}
              onChange={(event) => setName(event.currentTarget.value)}
              onKeyDown={(event) => event.key === 'Enter' && pair()}
            />
            <Button onClick={pair}>Show QR code</Button>
          </div>
        ) : (
          <div className={styles.result}>
            <QrCode value={device.pairingUrl} />
            <p className={styles.lead}>
              Scan with your phone's camera to connect <strong>{device.name}</strong>.
            </p>
            <code className={styles.url}>{device.pairingUrl}</code>
            <Button variant="subtle" onClick={() => setDevice(null)}>
              Pair another device
            </Button>
          </div>
        )}
      </div>
    </OverlayShell>
  )
}
