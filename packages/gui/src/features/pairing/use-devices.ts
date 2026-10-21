import { useCallback, useEffect, useState } from 'react'

//Types
import type { Transport } from '@soromi/client'
import type { DeviceSummary } from '@soromi/protocol'

/** What a device is listed as until it connects and says its own name. */
const UNNAMED = 'New phone'

/**
 * The phones and tablets paired with this computer, kept live: the daemon sends the list again
 * whenever one connects or drops, which is how a phone just paired shows up as connected. `paired`
 * is the one this window just paired, while its code is on screen.
 */
export function useDevices(transport: Transport) {
  const [devices, setDevices] = useState<DeviceSummary[]>([])
  const [pairing, setPairing] = useState<string | null>(null)

  useEffect(() => {
    const ask = () => transport.send({ type: 'list-devices' })
    const offMessage = transport.onMessage((message) => {
      if (message.type === 'device-list') setDevices(message.devices)
      if (message.type === 'device-paired') {
        setDevices((prev) => [
          ...prev.filter((one) => one.id !== message.device.id),
          message.device,
        ])
        setPairing(message.device.id)
      }
    })
    ask()
    const offOpen = transport.onOpen(ask)
    return () => {
      offMessage()
      offOpen()
    }
  }, [transport])

  // The phone names itself when it connects (its owner's name for it, or its model).
  const pair = useCallback(
    () => transport.send({ type: 'create-device', name: UNNAMED }),
    [transport],
  )
  const revoke = useCallback(
    (id: string) => transport.send({ type: 'revoke-device', id }),
    [transport],
  )
  const done = useCallback(() => setPairing(null), [])

  return {
    devices,
    paired: devices.find((one) => one.id === pairing) ?? null,
    pair,
    revoke,
    done,
  }
}

/** How a device is connected, in a few words: by which route, or not at all. */
export function deviceState(device: DeviceSummary): string {
  if (!device.connected) return 'Offline'
  return device.route === 'direct' ? 'Connected · Local network' : 'Connected · Relay'
}
