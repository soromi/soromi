import type { AgentOption } from '@soromi/ui/chat'
import type { AccountProfile, AgentAccount } from '@soromi/protocol'

const LABELS: Record<string, string> = { claude: 'Claude', codex: 'Codex', grok: 'Grok' }

/** The provider's display name (e.g. `claude` -> `Claude`). */
export const agentLabel = (agent: string) => LABELS[agent] ?? agent

/** Whether an account profile actually configures a provider (so an agent can really run under it). */
const accountHasProvider = (profiles: AccountProfile[], account: string, agent: string) =>
  profiles.find((p) => p.name === account)?.providers?.[agent] != null

/**
 * The agents a workspace can run. Its bound agents come first — but only the *real* ones: a binding
 * whose account doesn't exist or doesn't configure that provider is a phantom (workspace settings
 * used to bind every provider to a default account) and is dropped. With `includeUnbound`, providers
 * the user has an account for but hasn't bound here are appended (binding that account when picked).
 * Deduped by provider. Drives the composer's agent switcher (`includeUnbound`) and the sidebar's
 * "New session" menu (bound only).
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
  for (const binding of bindings) {
    if (seen.has(binding.agent)) continue
    if (profiles.length > 0 && !accountHasProvider(profiles, binding.id, binding.agent)) continue
    seen.add(binding.agent)
    // Already bound: the daemon resolves the account, so no `account` to send.
    out.push({ agent: binding.agent, accountLabel: binding.id, label: agentLabel(binding.agent) })
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
