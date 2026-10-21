import { useCallback, useState } from 'react'
import { View } from 'react-native'

//Components
import { Loader, Segmented } from '@/components'

//Config
import { defineStyles, useThemedStyles } from '@/config/theme'

//Features
import { FileTree } from '@/features/files/components/tree'
import { Changes } from '@/features/git/components/changes'
import { ControlBar } from '@/features/layout/components/control-bar'
import { SkillList } from '@/features/skills/components/list'
import { Shells } from '@/features/terminal/components/shells'

//Constants
import { PANEL } from '@/features/panel/constants/panel'

//State
import { useDaemonSession, useDaemonWorkspaceName } from '@/states/daemon/daemon.state.hook'

//Type
import type { PanelView } from '@/features/panel/types'
import type { PanelBodyProps } from './types'

/**
 * What sits beside a session on the desktop: the files of the workspace it runs in, its commands
 * and skills, the workspace's uncommitted changes, and terminals in it, one at a time. A phone shows this as a
 * screen of its own; a tablet as a pane beside the conversation.
 */
export const PanelBody = (props: PanelBodyProps) => {
  const styles = useThemedStyles(makeStyles)
  const id = props.session
  const workspace = useDaemonWorkspaceName(id)
  const session = useDaemonSession(id)
  const [view, setView] = useState<PanelView>(PANEL.initial)

  const handleView = useCallback((next: string) => setView(next as PanelView), [])

  // The workspace is known once the daemon's list has arrived.
  const waiting = (
    <View style={styles.center}>
      <Loader />
    </View>
  )

  return (
    <>
      <View style={styles.views}>
        <Segmented options={PANEL.views} value={view} onChange={handleView} />
      </View>
      {view === 'skills' && <SkillList session={id} usable={session?.mode === 'chat'} />}
      {view === 'files' && (workspace ? <FileTree workspace={workspace} /> : waiting)}
      {view === 'git' && (workspace ? <Changes workspace={workspace} /> : waiting)}
      {view === 'terminal' && (
        <>
          {/* Only the device in control types into a terminal: taking over is offered here. */}
          <ControlBar />
          {workspace ? <Shells workspace={workspace} /> : waiting}
        </>
      )}
    </>
  )
}

const makeStyles = defineStyles((theme) => ({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  views: { paddingHorizontal: theme.spacing.md, paddingVertical: theme.spacing.sm },
}))
