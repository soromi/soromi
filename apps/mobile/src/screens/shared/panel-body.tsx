import { View } from 'react-native'

//Components
import { Loader } from '@/components'

//Config
import { defineStyles, useThemedStyles } from '@/config/theme'

//Features
import { FileTree } from '@/features/files/components/tree'
import { Changes } from '@/features/git/components/changes'
import { ControlBar } from '@/features/layout/components/control-bar'
import { SkillList } from '@/features/skills/components/list'
import { Shells } from '@/features/terminal/components/shells'

//State
import { useDaemonSession, useDaemonWorkspaceName } from '@/states/daemon/daemon.state.hook'

//Type
import type { PanelBodyProps } from './types'

/**
 * What sits beside a session on the desktop: the files of the workspace it runs in, its commands
 * and skills, the workspace's uncommitted changes, and terminals in it, one at a time. A phone
 * shows this as a screen of its own; a tablet as a pane beside the conversation. Either one
 * says which view, and has the icons that move between them.
 */
export const PanelBody = (props: PanelBodyProps) => {
  const styles = useThemedStyles(makeStyles)
  const id = props.session
  const workspace = useDaemonWorkspaceName(id)
  const session = useDaemonSession(id)
  const view = props.view

  // The workspace is known once the daemon's list has arrived.
  const waiting = (
    <View style={styles.center}>
      <Loader />
    </View>
  )

  return (
    <>
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

const makeStyles = defineStyles(() => ({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
}))
