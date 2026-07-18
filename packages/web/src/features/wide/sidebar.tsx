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

//Styles
import styles from './sidebar.module.css'

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
    <aside ref={asideRef} className={styles.sidebar} style={{ width }}>
      <div className={styles.header}>
        <WorkspaceSwitcher />
      </div>
      <div className={styles.body}>
        {workspace && <div className={styles.sectionLabel}>{sidebarMode}</div>}
        {sidebarMode === 'files' ? (
          <FilesPanel workspace={workspace?.name} showHeading={false} />
        ) : (
          <SkillsPanel session={session} showHeading={false} full />
        )}
      </div>

      <div className={styles.resizer} onPointerDown={startResize} title="Drag to resize" />
    </aside>
  )
}
