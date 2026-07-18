import clsx from 'clsx'
import { useMemo, useState } from 'react'

//Components
import { AgentLogo } from './agent-logo'

//Styles
import styles from './usage-widget.module.css'

//Types
import type { AgentUsage } from '@soromi/protocol'

/** Per-agent brand: display name, accent color for bars/logo, and where "Manage plan" points. */
const BRANDS: Record<
  string,
  { label: string; color: string; manageUrl: string; logo: 'claude' | 'codex' }
> = {
  claude: {
    label: 'Claude',
    color: '#c96442',
    manageUrl: 'https://claude.ai/settings/usage',
    logo: 'claude',
  },
  codex: {
    label: 'Codex',
    color: '#6b82ac',
    manageUrl: 'https://chatgpt.com/codex/settings/usage',
    logo: 'codex',
  },
}

/** Friendlier names for the rolling windows the daemon reports. */
const WINDOW_LABELS: Record<string, string> = { '5h': 'Session · 5h', '7d': 'Weekly' }

/** A compact "3h 12m" until a unix-seconds instant, or empty when unknown or past. */
function formatCountdown(resetsAt: number): string {
  const seconds = Math.round(resetsAt - Date.now() / 1000)
  if (seconds <= 0) return 'soon'

  const days = Math.floor(seconds / 86400)
  const hours = Math.floor((seconds % 86400) / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)

  if (days > 0) return `${days}d ${hours}h`
  if (hours > 0) return `${hours}h ${minutes}m`

  return `${minutes}m`
}

type WindowView = { key: string; label: string; percent: number; width: string }
type AgentView = {
  agent: string
  label: string
  color: string
  logo: 'claude' | 'codex'
  plan: string | null
  note: string | null
  windows: WindowView[]
}

export interface UsageWidgetProps {
  /** Plan usage per agent active in the current workspace (from the daemon's cache). */
  agents: AgentUsage[]
  /** A fetch is in flight (spins the refresh icon). */
  loading: boolean
  /** No workspace active: the trigger is inert. */
  disabled?: boolean
  onRefresh: () => void
  /** Open the agent's plan-management page (desktop opens externally; web opens a tab). */
  onManage?: (url: string) => void
}

/**
 * Presentational usage indicator for the status bar. Shows inline session percentages and opens a
 * popup with rolling-window usage per agent. The host supplies the data + refresh; this owns only
 * the popup open state and the per-brand view math, so desktop and web render the same widget.
 */
export function UsageWidget({ agents, loading, disabled, onRefresh, onManage }: UsageWidgetProps) {
  const [open, setOpen] = useState(false)

  const views = useMemo<AgentView[]>(
    () =>
      agents.map((usage) => {
        const brand = BRANDS[usage.agent]

        return {
          agent: usage.agent,
          label: brand?.label ?? usage.agent,
          color: brand?.color ?? 'var(--soromi-accent)',
          logo: brand?.logo ?? 'claude',
          plan: usage.plan ?? null,
          note: usage.note ?? null,
          windows: usage.windows.map((window) => ({
            key: window.label,
            label: WINDOW_LABELS[window.label] ?? window.label,
            percent: Math.round(window.percent),
            width: `${Math.min(100, Math.max(0, window.percent))}%`,
          })),
        }
      }),
    [agents],
  )

  const soonestReset = useMemo(() => {
    const resets = agents.flatMap((a) =>
      a.windows.map((w) => w.resetsAt ?? Number.POSITIVE_INFINITY),
    )
    const min = Math.min(...resets)

    return Number.isFinite(min) ? formatCountdown(min) : null
  }, [agents])

  const manageUrl = useMemo(() => BRANDS[agents[0]?.agent ?? '']?.manageUrl ?? null, [agents])

  const triggerStats = useMemo(
    () =>
      views
        .filter((view) => view.windows.length > 0)
        .map((view) => ({
          agent: view.agent,
          color: view.color,
          percent: view.windows[0].percent,
        })),
    [views],
  )

  return (
    <div className={styles.side}>
      <button
        type="button"
        className={styles.trigger}
        disabled={disabled}
        onClick={() => setOpen((o) => !o)}
      >
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
          <path d="M3 3v18h18" />
          <path d="M7 15l4-5 3 3 5-7" />
        </svg>
        <span className={styles.triggerLabel}>Usage</span>

        {triggerStats.map((stat) => (
          <span key={stat.agent} className={styles.triggerStat}>
            <span className={styles.triggerDot} style={{ background: stat.color }} />
            {stat.percent}%
          </span>
        ))}

        <svg
          className={clsx(styles.triggerChevron, open && styles.triggerChevronOpen)}
          width="12"
          height="12"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M18 15l-6-6-6 6" />
        </svg>
      </button>

      {open && (
        <>
          {/** biome-ignore lint/a11y/noStaticElementInteractions: click-away backdrop. */}
          {/** biome-ignore lint/a11y/useKeyWithClickEvents: click-away backdrop. */}
          <div className={styles.backdrop} onClick={() => setOpen(false)} />
          <div className={clsx(styles.popup, styles.popupLeft)}>
            <div className={styles.popupHead}>
              <span className={styles.popupTitle}>Usage</span>
              <div className={styles.headEnd}>
                {soonestReset && <span className={styles.headReset}>Resets in {soonestReset}</span>}
                <button
                  type="button"
                  className={clsx(styles.refresh, loading && styles.spinning)}
                  onClick={onRefresh}
                  aria-label="Refresh usage"
                  disabled={loading}
                >
                  <svg
                    width="13"
                    height="13"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden="true"
                  >
                    <path d="M21 12a9 9 0 1 1-2.64-6.36" />
                    <path d="M21 3v6h-6" />
                  </svg>
                </button>
              </div>
            </div>

            <div className={styles.popupBody}>
              {views.length === 0 ? (
                <div className={styles.empty}>
                  <div className={styles.emptyTitle}>
                    {loading ? 'Loading usage…' : 'No usage available'}
                  </div>
                  {!loading && (
                    <div className={styles.emptyDesc}>Sign in to an agent to see plan usage.</div>
                  )}
                </div>
              ) : (
                views.map((view) => (
                  <div key={view.agent} className={styles.usageAgent}>
                    <div className={styles.usageAgentHead}>
                      <AgentLogo kind={view.logo} color={view.color} />
                      <span className={styles.usageAgentName}>{view.label}</span>
                      {view.plan && <span className={styles.usagePlan}>{view.plan}</span>}
                    </div>
                    {view.note && <p className={styles.usageNote}>{view.note}</p>}
                    {view.windows.map((window) => (
                      <div key={window.key} className={styles.usageWindow}>
                        <div className={styles.usageWindowHead}>
                          <span className={styles.usageWindowLabel}>{window.label}</span>
                          <span className={styles.usageWindowPct}>{window.percent}%</span>
                        </div>
                        <div className={styles.usageTrack}>
                          <div
                            className={styles.usageFill}
                            style={{ width: window.width, background: view.color }}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                ))
              )}
            </div>

            {manageUrl && onManage && (
              <button type="button" className={styles.manage} onClick={() => onManage(manageUrl)}>
                Manage plan
                <svg
                  width="13"
                  height="13"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <path d="M7 17L17 7" />
                  <path d="M7 7h10v10" />
                </svg>
              </button>
            )}
          </div>
        </>
      )}
    </div>
  )
}
