import { useEffect, useState } from 'react'

//Packages
import { useTransport } from '@soromi/client'
import { cn } from '@soromi/ui'

//Components
import { QrCode } from '@/features/pairing/qr-code'

//Types
import type { DeviceSummary } from '@soromi/protocol'

type Step = 'list' | 'name' | 'qr'

/** The status-bar popup trigger (also used by the usage widget). */
const TRIGGER =
  'flex cursor-pointer appearance-none items-center gap-[7px] rounded-lg border-none bg-transparent px-2.5 py-1 font-medium text-[var(--soromi-text-faint)] text-xs transition-colors enabled:hover:bg-[var(--soromi-bg-hover)] enabled:hover:text-[var(--soromi-text-dim)] disabled:cursor-default disabled:opacity-[0.55]'

/** The pop-up body (a column of rows / form fields). */
const POPUP_BODY = 'flex flex-col gap-2 p-2.5'

/** The accented full-width action button in the pair flow. */
const PRIMARY =
  'cursor-pointer appearance-none rounded-[9px] border-none bg-[var(--soromi-accent)] p-2.5 font-bold text-[13px] text-[var(--soromi-accent-on)]'

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
    <div className="relative">
      <button type="button" className={TRIGGER} onClick={() => setOpen((o) => !o)}>
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
        <span className="font-semibold text-[var(--soromi-text-dim)]">{devices.length}</span>{' '}
        devices
      </button>

      {open && (
        <>
          {/** biome-ignore lint/a11y/noStaticElementInteractions: click-away backdrop. */}
          {/** biome-ignore lint/a11y/useKeyWithClickEvents: click-away backdrop. */}
          <div className="fixed inset-0 z-[var(--z-popover-backdrop)]" onClick={close} />
          <div className="absolute right-1 bottom-10 z-[var(--z-popover)] w-80 overflow-hidden rounded-[14px] border border-[var(--soromi-border)] bg-[var(--soromi-bg-rail)] shadow-[0_20px_60px_rgb(0_0_0/50%)]">
            <div className="flex items-center justify-between border-[var(--soromi-border)] border-b px-3.5 pt-[13px] pb-[11px]">
              <span className="font-semibold text-[12.5px] text-[var(--soromi-text)]">
                {step === 'list' ? 'Paired devices' : 'Pair a device'}
              </span>
              <button
                type="button"
                className="h-6 w-6 cursor-pointer appearance-none rounded-md border-none bg-transparent text-[var(--soromi-text-faint)] text-sm hover:bg-[var(--soromi-bg-hover)]"
                onClick={close}
                aria-label="Close"
              >
                ✕
              </button>
            </div>

            {step === 'list' && (
              <div className={POPUP_BODY}>
                {devices.length === 0 ? (
                  <div className="px-1.5 pt-3.5 pb-4 text-center">
                    <div className="font-medium text-[13px] text-[var(--soromi-text-dim)]">
                      No devices connected
                    </div>
                    <div className="mt-[3px] text-[11.5px] text-[var(--soromi-text-faint)]">
                      Pair a phone or tablet to get started.
                    </div>
                  </div>
                ) : (
                  devices.map((device) => (
                    <div
                      key={device.id}
                      className="flex items-center justify-between rounded-lg px-2 py-[9px] hover:bg-[var(--soromi-bg-hover)]"
                    >
                      <span className="flex items-center gap-2 text-[13px] text-[var(--soromi-text)]">
                        <span
                          className={cn(
                            'h-2 w-2 flex-none rounded-full',
                            device.connected
                              ? 'bg-[var(--soromi-accent)]'
                              : 'bg-[var(--soromi-text-faint)]',
                          )}
                          title={device.connected ? 'Connected' : 'Offline'}
                        />
                        {device.name}
                        <span className="text-[11.5px] text-[var(--soromi-text-faint)]">
                          {device.connected ? 'Connected' : 'Offline'}
                        </span>
                      </span>
                      <button
                        type="button"
                        className="cursor-pointer appearance-none rounded-md border-none bg-transparent px-2 py-1 font-medium text-[#e08585] text-xs hover:bg-[var(--soromi-bg-active)]"
                        onClick={() => revoke(device.id)}
                      >
                        Revoke
                      </button>
                    </div>
                  ))
                )}
                <button
                  type="button"
                  className="cursor-pointer appearance-none rounded-[9px] border-none bg-transparent p-2.5 text-left font-semibold text-[13px] text-[var(--soromi-accent)] hover:bg-[var(--soromi-bg-hover)]"
                  onClick={() => setStep('name')}
                >
                  + Pair a device
                </button>
              </div>
            )}

            {step === 'name' && (
              <div className={POPUP_BODY}>
                <label
                  className="font-semibold text-[var(--soromi-text-dim)] text-xs"
                  htmlFor="device-name"
                >
                  Device name
                </label>
                <input
                  id="device-name"
                  className="w-full rounded-[9px] border border-[var(--soromi-border)] bg-[var(--soromi-bg-tab)] px-[11px] py-[9px] text-[13px] text-[var(--soromi-text)]"
                  value={name}
                  placeholder="My phone"
                  onChange={(event) => setName(event.currentTarget.value)}
                  onKeyDown={(event) => event.key === 'Enter' && pair()}
                />
                <button type="button" className={PRIMARY} onClick={pair}>
                  Show QR code
                </button>
                <button
                  type="button"
                  className="cursor-pointer appearance-none self-start border-none bg-transparent p-1.5 text-[var(--soromi-text-faint)] text-xs"
                  onClick={() => setStep('list')}
                >
                  ‹ Back
                </button>
              </div>
            )}

            {step === 'qr' && paired && (
              <div className={POPUP_BODY}>
                <div className="flex justify-center py-1.5">
                  <QrCode value={paired.pairingUrl} size={190} />
                </div>
                <p className="m-0 text-center text-[var(--soromi-text-dim)] text-xs">
                  Scan with your phone's camera to connect.
                </p>
                <code className="break-all rounded-lg border border-[var(--soromi-border)] bg-[var(--soromi-bg-tab)] px-2.5 py-2 text-center text-[10.5px] text-[var(--soromi-text-faint)]">
                  {paired.pairingUrl}
                </code>
                <button type="button" className={PRIMARY} onClick={() => setStep('list')}>
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
