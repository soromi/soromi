import type { CSSProperties } from 'react'

//Transport
import { useTransport } from '../transport/transport-context'

//Store
import { useClientStore } from '../store/client-store'

/**
 * Covers the terminal when another device is driving it. Only one viewport controls the terminals
 * at a time (it owns input + size); the rest show this and can take over. Renders nothing when this
 * viewport is the controller. Styled with the app's CSS variables, so it fits desktop and web.
 */
export function TakeoverScreen() {
  const transport = useTransport()
  const holder = useClientStore((s) => s.controlHolder)

  if (holder === null) return null

  return (
    <div style={cover}>
      <div style={card}>
        <svg
          width="34"
          height="34"
          viewBox="0 0 24 24"
          fill="none"
          stroke="var(--soromi-text-faint)"
          strokeWidth="1.6"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <rect x="2" y="4" width="20" height="13" rx="2" />
          <path d="M8 21h8M12 17v4" />
        </svg>
        <div style={title}>{holder} is in control</div>
        <div style={desc}>This terminal is being driven from another device.</div>
        <button
          type="button"
          style={button}
          onClick={() => transport.send({ type: 'take-control' })}
        >
          Take control
        </button>
      </div>
    </div>
  )
}

const cover: CSSProperties = {
  position: 'absolute',
  inset: 0,
  zIndex: 30,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: 24,
  background: 'var(--soromi-bg-terminal, #0a0a0b)',
}

const card: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  gap: 10,
  textAlign: 'center',
  maxWidth: 320,
}

const title: CSSProperties = {
  fontSize: 16,
  fontWeight: 600,
  color: 'var(--soromi-text, #f0f0f0)',
}

const desc: CSSProperties = {
  fontSize: 13,
  lineHeight: 1.5,
  color: 'var(--soromi-text-faint, #6a6a6e)',
}

const button: CSSProperties = {
  marginTop: 8,
  padding: '10px 18px',
  border: 'none',
  borderRadius: 10,
  background: 'var(--soromi-accent, #3ecf8e)',
  color: 'var(--soromi-accent-on, #08321f)',
  fontSize: 14,
  fontWeight: 700,
  cursor: 'pointer',
}
