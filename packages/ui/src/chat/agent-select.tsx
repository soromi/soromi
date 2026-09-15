import { ChevronDown } from 'lucide-react'

//Components
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '../components/ui/dropdown-menu'
import { ProviderIcon } from '../icons/provider-icon'

/** One agent the session can run under: a provider (`claude`, `codex`, …) and the account it binds to. */
export interface AgentOption {
  /** The provider key (`claude`, `codex`, `grok`). */
  agent: string
  /** The account to bind when switching to it; omit when the workspace already binds this agent. */
  account?: string
  /** The account name shown in the menu (e.g. `bookr`). */
  accountLabel: string
  /** The provider's display name (e.g. `Claude`). */
  label: string
}

/**
 * The composer's agent badge — which provider + account the chat runs under. With more than one
 * option it's a dropdown that switches the chat to another agent (Claude ⇄ Codex); with a single
 * option it's a passive badge, exactly as before. Switching restarts the session under the new agent
 * (a fresh conversation — providers don't share a transcript), so `onChange` should confirm upstream.
 */
export function AgentSelect({
  agent,
  account,
  options,
  onChange,
}: {
  agent: string
  account?: string
  options: AgentOption[]
  onChange: (agent: string, account?: string) => void
}) {
  const badge = (
    <>
      <ProviderIcon provider={agent} size={14} />
      {account}
    </>
  )

  // Nothing to switch to: keep the original passive badge (no chevron, not a button).
  if (options.length <= 1) {
    return (
      <span
        title={account ? `This session is signed in as the "${account}" account` : undefined}
        className="ml-auto flex items-center gap-1.5 rounded-md bg-[var(--soromi-bg-hover)] px-2 py-1 font-medium text-[12px] text-[var(--soromi-text-dim)]"
      >
        {badge}
      </span>
    )
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          title="Switch this chat's agent"
          className="ml-auto flex cursor-pointer appearance-none items-center gap-1.5 rounded-md border-none bg-[var(--soromi-bg-hover)] px-2 py-1 font-medium text-[12px] text-[var(--soromi-text-dim)] hover:text-[var(--soromi-text)]"
        >
          {badge}
          <ChevronDown className="h-3 w-3" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-52">
        {options.map((option) => {
          const active = option.agent === agent
          return (
            <DropdownMenuItem
              key={option.agent}
              onClick={() => !active && onChange(option.agent, option.account)}
              className="flex items-center gap-2"
            >
              <ProviderIcon provider={option.agent} size={14} />
              <span className="text-[13px]">{option.label}</span>
              <span className="ml-auto text-[11px] text-[var(--soromi-text-faint)]">
                {option.accountLabel}
                {active ? ' ·' : ''}
              </span>
            </DropdownMenuItem>
          )
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
