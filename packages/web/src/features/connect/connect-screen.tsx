import { useState } from 'react'

//Utils
import { pairingUrl, parsePairingLink } from '@/config/transport'

/**
 * Pairing screen: shown when the app is opened without relay config in the URL. Scanning the QR in
 * the desktop app opens the app already paired (its link carries `?relay&room&key`); this screen is
 * the fallback for pasting that link by hand.
 */
export function ConnectScreen() {
  const [link, setLink] = useState('')
  const [error, setError] = useState(false)

  const connect = () => {
    const config = parsePairingLink(link)
    if (!config) {
      setError(true)
      return
    }

    // Navigate to the pairing URL so the app reloads and dials the real relay transport.
    window.location.href = pairingUrl(config)
  }

  return (
    <div className="flex h-full flex-col items-center justify-center gap-7 px-6 pt-[calc(var(--safe-top)+24px)] pb-[calc(var(--safe-bottom)+24px)]">
      <div className="flex flex-col items-center gap-2">
        <div className="flex h-16 w-16 items-center justify-center rounded-[18px] bg-[#efece1]">
          <svg width="34" height="33" viewBox="0 0 57 56" fill="#2fae6a" aria-hidden="true">
            <path d="M44.796,6.605c0,3.645 -2.959,6.605 -6.605,6.605l-31.587,0c-3.645,0 -6.605,-2.959 -6.605,-6.605c0,-3.645 2.959,-6.605 6.605,-6.605l31.587,0c3.645,0 6.605,2.959 6.605,6.605Z" />
            <path d="M30.582,27.854c0,3.645 -2.959,6.605 -6.605,6.605l-17.373,0c-3.645,0 -6.605,-2.959 -6.605,-6.605c0,-3.645 2.959,-6.605 6.605,-6.605l17.373,0c3.645,0 6.605,2.959 6.605,6.605Z" />
            <path d="M57,49.103c0,3.645 -2.959,6.605 -6.605,6.605l-43.791,0c-3.645,0 -6.605,-2.959 -6.605,-6.605c0,-3.645 2.959,-6.605 6.605,-6.605l43.791,0c3.645,0 6.605,2.959 6.605,6.605Z" />
          </svg>
        </div>
        <div className="font-bold text-2xl">Soromi</div>
        <div className="text-[var(--soromi-text-faint)] text-sm">
          Remote control for your coding agents
        </div>
      </div>

      <div className="flex w-full max-w-[380px] flex-col gap-4 rounded-2xl border border-[var(--soromi-border)] bg-[var(--soromi-bg-sidebar)] p-5">
        <div className="font-semibold text-base">Connect to your Mac</div>

        <p className="m-0 text-center text-[13px] text-[var(--soromi-text-dim)] leading-[1.5]">
          Open Soromi on your Mac, choose <strong>Connect a phone</strong>, and scan the QR code
          with your camera. It opens this app already paired.
        </p>

        <div className="flex items-center gap-3 text-[var(--soromi-text-faint)] text-xs before:h-px before:flex-1 before:bg-[var(--soromi-border)] before:content-[''] after:h-px after:flex-1 after:bg-[var(--soromi-border)] after:content-['']">
          <span>or paste the pairing link</span>
        </div>

        <input
          className="w-full rounded-xl border border-[var(--soromi-border)] bg-[var(--soromi-bg-tab)] px-3.5 py-[13px] text-[13px] text-[var(--soromi-text)] placeholder:text-[var(--soromi-text-faint)]"
          placeholder="https://…?relay=…&room=…&key=…"
          autoComplete="off"
          autoCapitalize="off"
          spellCheck={false}
          value={link}
          onChange={(event) => {
            setLink(event.currentTarget.value)
            setError(false)
          }}
          onKeyDown={(event) => event.key === 'Enter' && connect()}
        />
        {error && (
          <div className="-mt-1.5 text-[#e08585] text-xs">
            That doesn't look like a pairing link.
          </div>
        )}

        <button
          type="button"
          className="w-full cursor-pointer appearance-none rounded-xl border-none bg-[var(--soromi-accent)] p-3.5 font-semibold text-[var(--soromi-accent-on)] text-base"
          onClick={connect}
        >
          Connect
        </button>
      </div>
    </div>
  )
}
