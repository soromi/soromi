//Store
import { useAppStore } from '@/stores/app-store'

//Components
import { FileTree } from '@/features/files/file-tree'

//Styles
import styles from './sidebar.module.css'

/** Contextual second column: the read-only project tree for the active workspace. */
export function Sidebar() {
  const active = useAppStore((s) => s.active)

  return (
    <aside className={styles.sidebar}>
      <div className={styles.label}>{active ?? 'no workspace'} · files</div>
      <FileTree />
    </aside>
  )
}
