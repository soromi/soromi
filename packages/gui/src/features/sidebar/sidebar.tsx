import { useRef } from 'react'
import { useShallow } from 'zustand/react/shallow'

//Store
import { useAppStore } from '@/stores/app-store'

//Components
import { FileTree } from '@/features/files/file-tree'
import { SkillList } from '@/features/skills/skill-list'
import { WorkspaceSwitcher } from '@/features/workspaces/workspace-switcher'

//Styles
import styles from './sidebar.module.css'

/**
 * Contextual second column. The header holds the workspace switcher; below it is the section the
 * rail selected (file tree or skills list). Notification and keep-awake controls live in the
 * top-right bar, so the switcher has the full width for long workspace names.
 */
export function Sidebar() {
  const { active, sidebarMode, sidebarWidth, setSidebarWidth } = useAppStore(
    useShallow((s) => ({
      active: s.active,
      sidebarMode: s.sidebarMode,
      sidebarWidth: s.sidebarWidth,
      setSidebarWidth: s.setSidebarWidth,
    })),
  )
  const asideRef = useRef<HTMLElement>(null)

  // Drag the right edge to resize; width is derived from the pointer's x minus the sidebar's left.
  const startResize = (event: React.PointerEvent) => {
    event.preventDefault()
    const left = asideRef.current?.getBoundingClientRect().left ?? 0

    const onMove = (move: PointerEvent) => setSidebarWidth(move.clientX - left)
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
    <aside ref={asideRef} className={styles.sidebar} style={{ width: sidebarWidth }}>
      <div className={styles.header}>
        <WorkspaceSwitcher />
      </div>

      <div className={styles.body}>
        {active && (
          <>
            <div className={styles.sectionLabel}>{sidebarMode}</div>
            {sidebarMode === 'files' ? <FileTree /> : <SkillList />}
          </>
        )}
      </div>

      <div className={styles.resizer} onPointerDown={startResize} title="Drag to resize" />
    </aside>
  )
}
