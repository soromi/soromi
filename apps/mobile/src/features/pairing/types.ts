import type { PairingError } from '@soromi/core'
import type { BarcodeSettings } from 'expo-camera'

export type ScannerProps = {
  /** Called with the text of each code the camera reads. */
  onScan: (code: string) => void
}

export type PasteProps = {
  onSubmit: (code: string) => void
  /** The text changed: an error about the last attempt no longer applies. */
  onEdit: () => void
}

export type PairingConfig = {
  steps: string
  /** The picture at the top of the screen: how tall it is. */
  hero: { height: number }
  errors: Record<PairingError, string> & {
    /** The code was fine, but the phone could not keep it. */
    save: string
  }
  camera: {
    prompt: string
    allow: string
    barcode: BarcodeSettings
  }
  paste: {
    label: string
    placeholder: string
    submit: string
  }
}
