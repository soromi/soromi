//Packages
import { useTransport } from '@soromi/client'

/** A key: its face and the bytes it sends to the PTY. `wide` keys take more room (arrows are 1). */
interface Key {
  label: string
  bytes: string
}

// The keys a phone keyboard lacks or makes awkward, sent straight to the agent's terminal.
const KEYS: Key[] = [
  { label: 'esc', bytes: '\x1b' },
  { label: 'tab', bytes: '\t' },
  { label: '⌃C', bytes: '\x03' },
  { label: '|', bytes: '|' },
  { label: '~', bytes: '~' },
  { label: '/', bytes: '/' },
  { label: '-', bytes: '-' },
  { label: '←', bytes: '\x1b[D' },
  { label: '↑', bytes: '\x1b[A' },
  { label: '↓', bytes: '\x1b[B' },
  { label: '→', bytes: '\x1b[C' },
]

/** The special-keys row above the on-screen keyboard. Sends raw bytes to the active session. */
export function KeyBar({ session }: { session?: string }) {
  const transport = useTransport()
  const press = (bytes: string) => {
    if (session) transport.send({ type: 'input', session, data: bytes })
  }

  return (
    <div className="flex-shrink-0 border-[var(--soromi-border)] border-t bg-[var(--soromi-bg-sidebar)] pb-[var(--safe-bottom)]">
      <div className="flex gap-1.5 overflow-x-auto p-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {KEYS.map((key) => (
          <button
            key={key.label}
            type="button"
            className="h-[38px] min-w-[42px] flex-none cursor-pointer appearance-none rounded-lg border border-[var(--soromi-border)] bg-[var(--soromi-bg-tab)] px-3 text-[15px] text-[var(--soromi-text-dim)] active:bg-[var(--soromi-bg-active)] active:text-[var(--soromi-text)] disabled:opacity-40"
            disabled={!session}
            onClick={() => press(key.bytes)}
          >
            {key.label}
          </button>
        ))}
      </div>
    </div>
  )
}
