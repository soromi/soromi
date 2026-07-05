//Icons
import ClaudeIcon from '@/assets/icons/claude.svg?react'
import CodexIcon from '@/assets/icons/codex.svg?react'

/** Brand marks for the AI providers, used in agent pickers. Unknown providers render nothing. */
export function ProviderIcon({ provider, size = 16 }: { provider: string; size?: number }) {
  switch (provider) {
    case 'claude':
      return <ClaudeIcon width={size} height={size} />
    case 'codex':
      return <CodexIcon width={size} height={size} />
    default:
      return null
  }
}
