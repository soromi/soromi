/** Sunburst ray endpoints for the Claude mark, precomputed once (12 rays from center). */
const RAYS = Array.from({ length: 12 }, (_, i) => {
  const angle = (i * Math.PI) / 6

  return {
    x1: 12 + Math.cos(angle) * 3.5,
    y1: 12 + Math.sin(angle) * 3.5,
    x2: 12 + Math.cos(angle) * 10,
    y2: 12 + Math.sin(angle) * 10,
  }
})

type Props = { kind: 'claude' | 'codex'; color: string; size?: number }

/** A brand mark for a provider: Claude's sunburst or Codex's ring, tinted with the brand color. */
export function AgentLogo({ kind, color, size = 18 }: Props) {
  if (kind === 'codex') {
    return (
      <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
        <circle cx="12" cy="12" r="8.5" fill="none" stroke={color} strokeWidth="2.2" />
        <circle cx="12" cy="12" r="3" fill={color} />
      </svg>
    )
  }

  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      {RAYS.map((ray) => (
        <line
          key={`${ray.x1}-${ray.y1}`}
          x1={ray.x1}
          y1={ray.y1}
          x2={ray.x2}
          y2={ray.y2}
          stroke={color}
          strokeWidth="2.1"
          strokeLinecap="round"
        />
      ))}
    </svg>
  )
}
