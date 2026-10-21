import { Check, Copy, Smartphone, X } from 'lucide-react'
import { useEffect, useState } from 'react'

//Packages
import { Dialog, DialogContent, DialogDescription, DialogTitle, cn } from '@soromi/ui'

//Utils
import { isMac } from '@/lib/platform'

//Components
import { Backdrop } from '@/shared/backdrop'
import { SoromiMark } from '@/shared/soromi-mark'
import { QrCode } from './qr-code'

//Hooks
import { deviceState } from './use-devices'

//Types
import type { DeviceSummary } from '@soromi/protocol'

type Tab = 'pair' | 'paired'

/** What this computer is called in the dialog's copy. */
const THIS = isMac ? 'this Mac' : 'this computer'

/** The accented full-width action. */
const PRIMARY =
  'w-full cursor-pointer appearance-none rounded-[11px] border-none bg-[var(--soromi-accent)] px-4 py-[11px] font-semibold text-[13.5px] text-[var(--soromi-accent-on)] transition-colors hover:bg-[var(--soromi-accent-hover)] disabled:cursor-default disabled:opacity-50'

/** A quiet bordered button. */
const QUIET =
  'inline-flex flex-none cursor-pointer appearance-none items-center gap-1.5 rounded-[9px] border border-[var(--soromi-border)] bg-transparent px-3 py-[7px] font-medium text-[12.5px] text-[var(--soromi-text-dim)] transition-colors hover:bg-[var(--soromi-bg-hover)] hover:text-[var(--soromi-text)]'

/**
 * Pairing phones and tablets with this computer, and the ones already paired, as a dialog of its
 * own: a phone drawn at the top, then two tabs. "Pair a phone" shows the code to scan in the
 * Soromi app (with the code itself to copy, for one that cannot scan) and follows it until the
 * phone connects, which names itself (its owner's name for it, or its model). "Paired" lists each with how it is connected now, and revokes one
 * after asking.
 */
export function DevicesDialog({
  open,
  onOpenChange,
  devices,
  paired,
  onPair,
  onRevoke,
  onDone,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  devices: DeviceSummary[]
  /** The device this window just paired, while its code is on screen. */
  paired: DeviceSummary | null
  onPair: () => void
  onRevoke: (id: string) => void
  /** The code has served: the pair tab goes back to offering the next one. */
  onDone: () => void
}) {
  const [tab, setTab] = useState<Tab>('pair')

  // Opened: straight to pairing when nothing is paired yet, to the list otherwise.
  // biome-ignore lint/correctness/useExhaustiveDependencies: only when it opens, not as devices change.
  useEffect(() => {
    if (open) setTab(devices.length === 0 ? 'pair' : 'paired')
  }, [open])

  const close = (next: boolean) => {
    onOpenChange(next)
    if (!next) onDone()
  }

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent
        hideClose
        className="max-h-[calc(100vh-48px)] max-w-[468px] gap-0 overflow-y-auto rounded-[18px] border-[var(--soromi-border)] bg-[var(--soromi-bg-sidebar)] p-0 [box-shadow:var(--soromi-shadow-float)]"
      >
        <Hero connected={paired?.connected ?? false} />
        <button
          type="button"
          aria-label="Close"
          onClick={() => close(false)}
          className="absolute top-3.5 right-3.5 flex h-7 w-7 cursor-pointer appearance-none items-center justify-center rounded-lg border-none bg-transparent text-[var(--soromi-text-faint)] transition-colors hover:bg-[var(--soromi-bg-hover)] hover:text-[var(--soromi-text)]"
        >
          <X className="size-4" />
        </button>

        <div className="flex flex-col gap-4 px-7 pt-1 pb-7">
          <div className="text-center">
            <DialogTitle className="font-semibold text-[19px] text-[var(--soromi-text)] tracking-[-0.01em]">
              Connect a phone to {THIS}
            </DialogTitle>
            <DialogDescription className="mx-auto mt-1.5 max-w-[340px] text-[13px] text-[var(--soromi-text-faint)] leading-[1.5]">
              Follow every session, reply to the agent and answer its requests from anywhere.
            </DialogDescription>
          </div>

          <div className="grid grid-cols-2 gap-1 rounded-[12px] bg-[var(--soromi-bg-hover)] p-1">
            <TabButton active={tab === 'pair'} onClick={() => setTab('pair')}>
              Pair a phone
            </TabButton>
            <TabButton active={tab === 'paired'} onClick={() => setTab('paired')}>
              Paired
              <span className="rounded-full bg-[var(--soromi-bg-active)] px-1.5 text-[11px] text-[var(--soromi-text-dim)] tabular-nums">
                {devices.length}
              </span>
            </TabButton>
          </div>

          {tab === 'pair' &&
            (paired ? (
              <PairingCode device={paired} onAnother={onDone} />
            ) : (
              <div className="flex flex-col gap-3">
                {/* biome-ignore lint/a11y/noAutofocus: the one thing to do on this tab. */}
                <button type="button" autoFocus className={PRIMARY} onClick={onPair}>
                  Show the pairing code
                </button>
                <Steps />
              </div>
            ))}

          {tab === 'paired' && (
            <PairedList devices={devices} onRevoke={onRevoke} onPair={() => setTab('pair')} />
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}

/** One of the two tabs, as a segment of the control. */
function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'inline-flex cursor-pointer appearance-none items-center justify-center gap-2 rounded-[9px] border-none px-3 py-[7px] font-medium text-[13px] transition-colors',
        active
          ? 'bg-[var(--soromi-bg-sidebar)] text-[var(--soromi-text)] [box-shadow:var(--soromi-shadow-selected)]'
          : 'bg-transparent text-[var(--soromi-text-faint)] hover:text-[var(--soromi-text-dim)]',
      )}
    >
      {children}
    </button>
  )
}

/**
 * The top of the dialog: a phone, drawn over a field of dots that fades out, with the Soromi
 * mark on its screen. It shows a tick once the phone being paired has connected.
 */
function Hero({ connected }: { connected: boolean }) {
  return (
    <Backdrop fade="var(--soromi-bg-sidebar)" className="h-[156px]">
      <div className="absolute top-7 left-1/2 h-[170px] w-[128px] -translate-x-1/2 rounded-[26px] border border-[var(--soromi-border-strong)] bg-[var(--soromi-bg-sidebar)] p-[5px] [box-shadow:var(--soromi-shadow-popover)]">
        <div className="relative flex h-full flex-col items-center rounded-[21px] border border-[var(--soromi-border-subtle)] bg-[var(--soromi-bg-tab)] pt-3">
          <div className="h-[9px] w-[34px] rounded-full bg-[var(--soromi-bg-active)]" />
          <div className="mt-5 flex h-11 w-11 items-center justify-center rounded-[13px] border border-[var(--soromi-border)] bg-[var(--soromi-bg-sidebar)]">
            {connected ? (
              <Check className="size-5 text-[var(--soromi-accent)]" strokeWidth={2.6} />
            ) : (
              <SoromiMark width={20} height={18} />
            )}
          </div>
          <div className="mt-3 h-[5px] w-[62px] rounded-full bg-[var(--soromi-bg-active)]" />
          <div className="mt-1.5 h-[5px] w-[44px] rounded-full bg-[var(--soromi-bg-hover)]" />
        </div>
      </div>
      {/* The phone runs on below the edge: the backdrop fades it into the dialog. */}
    </Backdrop>
  )
}

/** Under the button: what pairing goes through. */
function Steps() {
  const steps = [
    'Open Soromi on your phone and choose to pair a computer.',
    'Scan the code that shows next, or paste it.',
    `Nearby, it connects straight to ${THIS}; anywhere else, end-to-end encrypted through the relay.`,
  ]
  return (
    <ol className="m-0 mt-1 flex list-none flex-col gap-2 p-0">
      {steps.map((step, index) => (
        <li
          key={step}
          className="flex gap-2.5 text-[12.5px] text-[var(--soromi-text-faint)] leading-[1.5]"
        >
          <span className="flex h-[18px] w-[18px] flex-none items-center justify-center rounded-full border border-[var(--soromi-border)] font-semibold text-[10.5px] text-[var(--soromi-text-dim)]">
            {index + 1}
          </span>
          {step}
        </li>
      ))}
    </ol>
  )
}

/**
 * The code a phone pairs with: as a QR to scan in the Soromi app, and as text to copy for one that
 * cannot scan. It follows the phone until it connects, then says how.
 */
function PairingCode({ device, onAnother }: { device: DeviceSummary; onAnother: () => void }) {
  const [copied, setCopied] = useState(false)
  const copy = () => {
    void navigator.clipboard?.writeText(device.pairingCode).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    })
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col items-center gap-3.5 rounded-[16px] border border-[var(--soromi-border)] bg-[var(--soromi-bg-tab)] px-5 pt-5 pb-4">
        <div className="rounded-[14px] bg-white p-2 [box-shadow:var(--soromi-shadow-selected)]">
          <QrCode value={device.pairingCode} size={232} mark />
        </div>
        <div
          className={cn(
            'flex items-center gap-2 text-[12.5px]',
            device.connected ? 'text-[var(--soromi-accent)]' : 'text-[var(--soromi-text-dim)]',
          )}
        >
          {device.connected ? (
            <Check className="size-4" strokeWidth={2.6} />
          ) : (
            <span className="h-2 w-2 rounded-full bg-[var(--soromi-amber)] motion-safe:animate-status-pulse" />
          )}
          {device.connected
            ? `“${device.name}” is connected · ${device.route === 'direct' ? 'Local network' : 'Relay'}`
            : 'Waiting for your phone to scan it…'}
        </div>
      </div>
      <div className="flex items-center gap-3">
        <span className="min-w-0 flex-1 text-[12px] text-[var(--soromi-text-faint)] leading-[1.45]">
          Can’t scan? Copy the code and paste it in Soromi on your phone.
        </span>
        <button type="button" className={QUIET} onClick={copy}>
          {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
          {copied ? 'Copied' : 'Copy code'}
        </button>
      </div>
      <button
        type="button"
        onClick={onAnother}
        className="cursor-pointer appearance-none self-center border-none bg-transparent p-1 font-medium text-[12.5px] text-[var(--soromi-accent)] hover:underline"
      >
        {device.connected ? 'Pair another phone' : 'Start over'}
      </button>
    </div>
  )
}

/** The devices paired with this computer, each with how it is connected now. */
function PairedList({
  devices,
  onRevoke,
  onPair,
}: {
  devices: DeviceSummary[]
  onRevoke: (id: string) => void
  onPair: () => void
}) {
  if (devices.length === 0) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-[16px] border border-[var(--soromi-border)] border-dashed px-6 py-8 text-center">
        <Smartphone className="size-6 text-[var(--soromi-text-ghost)]" />
        <div>
          <div className="font-medium text-[13.5px] text-[var(--soromi-text-dim)]">
            No phone paired yet
          </div>
          <div className="mt-1 text-[12.5px] text-[var(--soromi-text-faint)]">
            Pair one to follow your sessions away from {THIS}.
          </div>
        </div>
        <button type="button" className={QUIET} onClick={onPair}>
          Pair a phone
        </button>
      </div>
    )
  }
  return (
    <div className="flex flex-col overflow-hidden rounded-[16px] border border-[var(--soromi-border)]">
      {devices.map((device) => (
        <DeviceRow key={device.id} device={device} onRevoke={onRevoke} />
      ))}
    </div>
  )
}

/** One paired device; revoking it asks first, in place. */
function DeviceRow({
  device,
  onRevoke,
}: {
  device: DeviceSummary
  onRevoke: (id: string) => void
}) {
  const [asking, setAsking] = useState(false)

  return (
    <div className="flex items-center gap-3 border-[var(--soromi-border-subtle)] border-b px-4 py-3 last:border-b-0">
      <span className="relative flex h-9 w-9 flex-none items-center justify-center rounded-[10px] border border-[var(--soromi-border)] bg-[var(--soromi-bg-tab)] text-[var(--soromi-text-dim)]">
        <Smartphone className="size-[18px]" />
        <span
          className={cn(
            'absolute -right-0.5 -bottom-0.5 h-2.5 w-2.5 rounded-full border-2 border-[var(--soromi-bg-sidebar)]',
            device.connected ? 'bg-[var(--soromi-accent)]' : 'bg-[var(--soromi-text-ghost)]',
          )}
        />
      </span>
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="truncate font-medium text-[13.5px] text-[var(--soromi-text)]">
          {device.name}
        </span>
        <span className="truncate text-[12px] text-[var(--soromi-text-faint)]">
          {deviceState(device)}
        </span>
      </span>
      {asking ? (
        <span className="flex flex-none items-center gap-1.5">
          <button type="button" className={QUIET} onClick={() => setAsking(false)}>
            Keep
          </button>
          <button
            type="button"
            onClick={() => onRevoke(device.id)}
            className="cursor-pointer appearance-none rounded-[9px] border-none bg-[var(--soromi-danger-soft)] px-3 py-[7px] font-semibold text-[12.5px] text-[var(--soromi-danger-on)] transition-colors hover:bg-[var(--soromi-danger-hover)]"
          >
            Revoke
          </button>
        </span>
      ) : (
        <button
          type="button"
          onClick={() => setAsking(true)}
          title="It has to be paired again to connect"
          className="flex-none cursor-pointer appearance-none rounded-[9px] border-none bg-transparent px-3 py-[7px] font-medium text-[12.5px] text-[var(--soromi-danger-soft)] transition-colors hover:bg-[color-mix(in_srgb,var(--soromi-danger-soft)_10%,transparent)]"
        >
          Revoke
        </button>
      )}
    </div>
  )
}
