import { useEffect } from 'react'

//Packages
import { useClientStore } from '@soromi/client'

//Store
import { useAppStore } from '@/stores/app-store'

//Utils
import { isMac } from '@/lib/platform'

/**
 * Slack-style workspace shortcuts, platform-aware: the primary modifier is ⌘ on macOS and Ctrl on
 * Windows/Linux. Mod+1–9 jumps to a workspace by position; Mod+Alt+↓ / Mod+Alt+↑ cycles to the
 * next / previous one. Handled at the window in the capture phase, so it wins over the terminal,
 * and only stops the keys it actually consumes.
 */
export function useWorkspaceShortcuts() {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const primary = isMac ? event.metaKey : event.ctrlKey
      if (!primary) return

      const workspaces = useClientStore.getState().workspaces
      if (workspaces.length === 0) return

      const { active, select } = useAppStore.getState()

      // ⌘1–9: jump to the workspace at that position.
      if (!event.altKey && /^[1-9]$/.test(event.key)) {
        const index = Number(event.key) - 1
        if (index >= workspaces.length) return

        event.preventDefault()
        event.stopPropagation()
        select(workspaces[index].name)
        return
      }

      // ⌘⌥↓ / ⌘⌥↑: cycle to the next / previous workspace.
      if (event.altKey && (event.key === 'ArrowDown' || event.key === 'ArrowUp')) {
        const current = workspaces.findIndex((w) => w.name === active)
        const delta = event.key === 'ArrowDown' ? 1 : -1
        const next = (current + delta + workspaces.length) % workspaces.length

        event.preventDefault()
        event.stopPropagation()
        select(workspaces[next].name)
      }
    }

    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [])
}
