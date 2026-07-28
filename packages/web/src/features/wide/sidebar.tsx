import { useRef } from 'react'
import { useShallow } from 'zustand/react/shallow'

//Packages
import type { WorkspaceInfo } from '@soromi/client'

//Store
import { useUiStore } from '@/stores/ui-store'

//Components
import { FilesPanel } from '@/features/files/files-panel'
import { SkillsPanel } from '@/features/skills/skills-panel'
import { WorkspaceSwitcher } from './workspace-switcher'

/** The wide layout's second column: the workspace switcher, then the rail-selected panel. */
export function Sidebar({ workspace, session }: { workspace?: WorkspaceInfo; session?: string }) {
  const { sidebarMode, width, setWidth } = useUiStore(
    useShallow((s) => ({
      sidebarMode: s.sidebarMode,
      width: s.sidebarWidth,
      setWidth: s.setSidebarWidth,
    })),
  )
  const asideRef = useRef<HTMLElement>(null)

  // Drag the right edge to resize; width is the pointer's x minus the sidebar's left.
  const startResize = (event: React.PointerEvent) => {
    event.preventDefault()
    const left = asideRef.current?.getBoundingClientRect().left ?? 0

    const onMove = (move: PointerEvent) => setWidth(move.clientX - left)
    const onUp = () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
    }

    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'
  }

  return (
    <aside
      ref={asideRef}
      className="relative flex w-[250px] flex-none flex-col overflow-hidden border-[var(--soromi-border)] border-r bg-[var(--soromi-bg-sidebar)]"
      style={{ width }}
    >
      <div className="flex h-[54px] flex-shrink-0 items-center border-[var(--soromi-border)] border-b px-2">
        <WorkspaceSwitcher />
      </div>
      <div className="flex min-h-0 flex-1 flex-col">
        {workspace && (
          <div className="flex-shrink-0 px-4 pt-3.5 pb-1.5 font-semibold text-[11px] text-[var(--soromi-text-faint)] uppercase tracking-[0.08em]">
            {sidebarMode}
          </div>
        )}
        {sidebarMode === 'files' ? (
          <FilesPanel workspace={workspace?.name} showHeading={false} />
        ) : (
          <SkillsPanel session={session} showHeading={false} full />
        )}
      </div>

      {/* Drag handle on the right edge: a thin line that turns accent on hover/drag. */}
      <div
        className="absolute inset-y-0 right-[-3px] z-[5] w-[7px] cursor-col-resize after:absolute after:inset-y-0 after:right-[3px] after:w-px after:bg-transparent after:transition-colors after:content-[''] hover:after:bg-[var(--soromi-accent)] active:after:bg-[var(--soromi-accent)]"
        onPointerDown={startResize}
        title="Drag to resize"
      />
    </aside>
  )
}
