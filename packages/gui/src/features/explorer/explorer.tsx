import { useRef } from 'react'
import { useShallow } from 'zustand/react/shallow'

//Packages
import { cn } from '@soromi/ui'

//Store
import { useAppStore } from '@/stores/app-store'

//Components
import { FileTree } from '@/features/files/file-tree'
import { SkillList } from '@/features/skills/skill-list'

//Icons
import FilesSvg from '@/assets/icons/files.svg?react'
import SkillsSvg from '@/assets/icons/skills.svg?react'

/**
 * The right-hand Explorer panel: the Files / Skills tabs over the tree or skills list, moved out of
 * the left sidebar. Closable (× in its header, or the toggle in the tab bar) and resizable from its
 * left edge; the width and open state are persisted.
 */
export function Explorer() {
  const { active, sidebarMode, explorerWidth, setSidebarMode, setExplorerWidth, setExplorerOpen } =
    useAppStore(
      useShallow((s) => ({
        active: s.active,
        sidebarMode: s.sidebarMode,
        explorerWidth: s.explorerWidth,
        setSidebarMode: s.setSidebarMode,
        setExplorerWidth: s.setExplorerWidth,
        setExplorerOpen: s.setExplorerOpen,
      })),
    )
  const asideRef = useRef<HTMLElement>(null)

  // Drag the left edge to resize; width grows as the pointer moves toward the window's left.
  const startResize = (event: React.PointerEvent) => {
    event.preventDefault()
    const right = asideRef.current?.getBoundingClientRect().right ?? 0
    const onMove = (move: PointerEvent) => setExplorerWidth(right - move.clientX)
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
      className="relative flex flex-shrink-0 flex-col overflow-hidden border-[var(--soromi-border-subtle)] border-l bg-[var(--soromi-bg-sidebar)] text-[13px] text-[var(--soromi-text-dim)]"
      style={{ width: explorerWidth }}
    >
      {/* Drag handle on the left edge: a thin line that turns accent on hover/drag. */}
      <div
        className="absolute inset-y-0 left-[-3px] z-[var(--z-sidebar-resize)] w-[7px] cursor-col-resize after:absolute after:inset-y-0 after:left-[3px] after:w-px after:bg-transparent after:transition-colors after:content-[''] hover:after:bg-[var(--soromi-accent)] active:after:bg-[var(--soromi-accent)]"
        onPointerDown={startResize}
        title="Drag to resize"
      />

      <div className="box-border flex h-[41px] flex-none items-center justify-between border-[var(--soromi-border)] border-b px-[13px]">
        <span className="text-[10.5px] text-[var(--soromi-text-faint)] uppercase tracking-[0.09em]">
          Explorer
        </span>
        <button
          type="button"
          title="Close"
          onClick={() => setExplorerOpen(false)}
          className="flex h-[24px] w-[24px] cursor-pointer appearance-none items-center justify-center rounded-[7px] border-none bg-transparent text-[var(--soromi-text-faint)] hover:bg-[var(--soromi-bg-hover)] hover:text-[var(--soromi-text-dim)]"
        >
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.9"
            strokeLinecap="round"
            aria-hidden="true"
          >
            <path d="M6 6l12 12M18 6L6 18" />
          </svg>
        </button>
      </div>

      <div className="flex flex-none gap-1 px-3 pt-2.5 pb-2">
        <SectionTab
          label="Files"
          active={sidebarMode === 'files'}
          onClick={() => setSidebarMode('files')}
          icon={<FilesSvg width={14} height={14} />}
        />
        <SectionTab
          label="Skills"
          active={sidebarMode === 'skills'}
          onClick={() => setSidebarMode('skills')}
          icon={<SkillsSvg width={14} height={14} />}
        />
      </div>

      <div className="min-h-0 flex-1 overflow-auto px-2 pb-3">
        {active && (sidebarMode === 'files' ? <FileTree /> : <SkillList />)}
      </div>
    </aside>
  )
}

/** A Files/Skills toggle tab: a green pill when active. */
function SectionTab({
  label,
  active,
  onClick,
  icon,
}: {
  label: string
  active: boolean
  onClick: () => void
  icon: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'flex cursor-pointer appearance-none items-center gap-1.5 rounded-lg border-none bg-transparent px-[11px] py-1.5 font-semibold text-[12.5px] text-[var(--soromi-text-faint)] hover:bg-[var(--soromi-bg-hover)] hover:text-[var(--soromi-text-dim)]',
        active &&
          'bg-[var(--soromi-accent-dim)] text-[var(--soromi-accent)] hover:bg-[var(--soromi-accent-dim)] hover:text-[var(--soromi-accent)]',
      )}
    >
      {icon}
      {label}
    </button>
  )
}
