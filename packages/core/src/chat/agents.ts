//Types
import type { AccountProfile, AgentAccount } from '@soromi/protocol'

/**
 * One agent a session can run under: a provider (`claude`, `codex`, …) and the account it runs it
 * with. A workspace can bind more than one account to a provider: each is an option of its own.
 */
export interface AgentOption {
  /** The provider key (`claude`, `codex`, `grok`). */
  agent: string
  /**
   * The account to run under, sent when picking the option. Omitted only for a binding listed
   * before the account profiles have loaded, when the daemon resolves it.
   */
  account?: string
  /** The account name shown in the menu (e.g. `bookr`). */
  accountLabel: string
  /** The provider's display name (e.g. `Claude`). */
  label: string
}

const LABELS: Record<string, string> = { claude: 'Claude', codex: 'Codex', grok: 'Grok' }

/** The provider's display name (e.g. `claude` -> `Claude`). */
export const agentLabel = (agent: string) => LABELS[agent] ?? agent

/** Whether an account profile actually configures a provider (so an agent can really run under it). */
const accountHasProvider = (profiles: AccountProfile[], account: string, agent: string) =>
  profiles.find((p) => p.name === account)?.providers?.[agent] != null

/**
 * The agents a workspace can run, one option per account: its bindings come first, in their order
 * (a provider's first is the one its tabs follow), but only the *real* ones: a binding whose
 * account doesn't exist or doesn't configure that provider is a phantom (workspace settings used to
 * bind every provider to a default account) and is dropped. With `includeUnbound`, providers the
 * user has an account for but hasn't bound here are appended (binding that account when picked).
 * Drives the composer's agent switcher and the "New session" menu.
 *
 * Until the account profiles load, bindings are kept as-is so the list isn't briefly empty.
 */
export function agentOptionsFor(
  bindings: AgentAccount[],
  profiles: AccountProfile[],
  includeUnbound = true,
): AgentOption[] {
  const out: AgentOption[] = []
  const seen = new Set<string>()
  const listed = new Set<string>()
  for (const binding of bindings) {
    const key = agentOptionKey(binding.agent, binding.id)
    if (listed.has(key)) continue
    if (profiles.length > 0 && !accountHasProvider(profiles, binding.id, binding.agent)) continue
    listed.add(key)
    seen.add(binding.agent)
    out.push({
      agent: binding.agent,
      account: binding.id,
      accountLabel: binding.id,
      label: agentLabel(binding.agent),
    })
  }
  if (includeUnbound) {
    for (const profile of profiles) {
      for (const provider of Object.keys(profile.providers ?? {})) {
        if (seen.has(provider)) continue
        seen.add(provider)
        out.push({
          agent: provider,
          account: profile.name,
          accountLabel: profile.name,
          label: agentLabel(provider),
        })
      }
    }
  }
  return out
}

/** What tells options apart: a provider can be offered under more than one account. */
export const agentOptionKey = (agent: string, account: string | undefined) =>
  `${agent}\n${account ?? ''}`

/** Whether an option is the one a session runs now: its provider, under its account. */
export const isCurrentAgent = (option: AgentOption, agent: string, account: string | undefined) =>
  option.agent === agent && option.accountLabel === account

/** The agent a new session starts under, and the account to bind when the workspace binds none. */
export interface SessionAgent {
  agent: string
  /** Absent when the workspace already binds the agent: the daemon then resolves the account. */
  account?: string
}

/** The provider a new session falls back to in a workspace that binds no agent at all. */
const FALLBACK_AGENT = 'claude'
/** The account bound when no profile configures the agent. */
const FALLBACK_ACCOUNT = 'personal'

/**
 * What a new session in a workspace runs under: the agent picked (when the workspace offers more
 * than one), or else its first bound agent. An agent the workspace does not bind yet is bound to
 * the first account that configures it.
 */
export function sessionAgentFor(
  bindings: AgentAccount[],
  profiles: AccountProfile[],
  choice?: { agent: string; account?: string },
): SessionAgent {
  const agent = choice?.agent ?? bindings[0]?.agent ?? FALLBACK_AGENT
  if (choice?.account) return { agent, account: choice.account }
  if (bindings.some((binding) => binding.agent === agent)) return { agent }
  const profile = profiles.find((one) => one.providers?.[agent] != null)
  return { agent, account: profile?.name ?? FALLBACK_ACCOUNT }
}
