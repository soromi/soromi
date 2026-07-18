//Icons
import ClaudeIcon from './claude.svg?react'
import CodexIcon from './codex.svg?react'

/** Brand marks for the AI providers, used in agent pickers and tabs. Unknown providers render nothing. */
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
