import clsx from 'clsx'
import { useEffect, useState } from 'react'

//Packages
import { useTransport } from '@soromi/client'

//Components
import { QrCode } from '@/features/pairing/qr-code'

//Styles
import styles from './status-bar.module.css'

//Types
import type { DeviceSummary } from '@soromi/protocol'

type Step = 'list' | 'name' | 'qr'

/**
 * Connected-devices control on the right of the status bar. Opens a popup upward to list paired
 * devices (revoke them) and pair a new one (name -> QR), all over the local link.
 */
export function DevicesWidget() {
  const transport = useTransport()
  const [devices, setDevices] = useState<DeviceSummary[]>([])
  const [open, setOpen] = useState(false)
  const [step, setStep] = useState<Step>('list')
  const [name, setName] = useState('My phone')
  const [paired, setPaired] = useState<DeviceSummary | null>(null)

  useEffect(() => {
    const off = transport.onMessage((message) => {
      if (message.type === 'device-list') setDevices(message.devices)
      if (message.type === 'device-paired') {
        setDevices((prev) => [...prev, message.device])
        setPaired(message.device)
        setStep('qr')
      }
    })
    transport.send({ type: 'list-devices' })

    return off
  }, [transport])

  const close = () => {
    setOpen(false)
    setStep('list')
    setName('My phone')
    setPaired(null)
  }
  const pair = () => transport.send({ type: 'create-device', name: name.trim() || 'Phone' })
  const revoke = (id: string) => transport.send({ type: 'revoke-device', id })

  return (
    <div className={styles.side}>
      <button type="button" className={styles.trigger} onClick={() => setOpen((o) => !o)}>
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.9"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <rect x="2" y="4" width="20" height="13" rx="2" />
          <path d="M2 20h20" />
        </svg>
        <span className={styles.triggerLabel}>{devices.length}</span> devices
      </button>

      {open && (
        <>
          {/** biome-ignore lint/a11y/noStaticElementInteractions: click-away backdrop. */}
          {/** biome-ignore lint/a11y/useKeyWithClickEvents: click-away backdrop. */}
          <div className={styles.backdrop} onClick={close} />
          <div className={clsx(styles.popup, styles.popupRight)}>
            <div className={styles.popupHead}>
              <span className={styles.popupTitle}>
                {step === 'list' ? 'Connected devices' : 'Pair a device'}
              </span>
              <button
                type="button"
                className={styles.popupClose}
                onClick={close}
                aria-label="Close"
              >
                ✕
              </button>
            </div>

            {step === 'list' && (
              <div className={styles.popupBody}>
                {devices.length === 0 ? (
                  <div className={styles.empty}>
                    <div className={styles.emptyTitle}>No devices connected</div>
                    <div className={styles.emptyDesc}>Pair a phone or tablet to get started.</div>
                  </div>
                ) : (
                  devices.map((device) => (
                    <div key={device.id} className={styles.deviceRow}>
                      <span className={styles.deviceName}>{device.name}</span>
                      <button
                        type="button"
                        className={styles.revoke}
                        onClick={() => revoke(device.id)}
                      >
                        Revoke
                      </button>
                    </div>
                  ))
                )}
                <button type="button" className={styles.pairBtn} onClick={() => setStep('name')}>
                  + Pair a device
                </button>
              </div>
            )}

            {step === 'name' && (
              <div className={styles.popupBody}>
                <label className={styles.label} htmlFor="device-name">
                  Device name
                </label>
                <input
                  id="device-name"
                  className={styles.input}
                  value={name}
                  placeholder="My phone"
                  onChange={(event) => setName(event.currentTarget.value)}
                  onKeyDown={(event) => event.key === 'Enter' && pair()}
                />
                <button type="button" className={styles.primary} onClick={pair}>
                  Show QR code
                </button>
                <button type="button" className={styles.back} onClick={() => setStep('list')}>
                  ‹ Back
                </button>
              </div>
            )}

            {step === 'qr' && paired && (
              <div className={styles.popupBody}>
                <div className={styles.qrWrap}>
                  <QrCode value={paired.pairingUrl} size={190} />
                </div>
                <p className={styles.qrHint}>Scan with your phone's camera to connect.</p>
                <code className={styles.url}>{paired.pairingUrl}</code>
                <button type="button" className={styles.primary} onClick={() => setStep('list')}>
                  Done pairing
                </button>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  )
}
