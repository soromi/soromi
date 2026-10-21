import { ScrollView, View } from 'react-native'

//Components
import { IconButton } from '@/components'

//Config
import { defineStyles, useThemedStyles } from '@/config/theme'

//Components
import { AgentPicker } from './agent-picker'
import { ModelPicker } from './model-picker'
import { PermissionPicker } from './permission-picker'

//Constants
import { CHAT } from '../constants/chat'

//State
import { useDaemonSession } from '@/states/daemon/daemon.state.hook'

//Type
import type { ToolbarProps } from '../types'

/**
 * Under the message box: what goes with the message and how the agent runs it (pictures, model,
 * permissions, account) on one side, and sending or stopping on the other. The first group
 * scrolls sideways, so nothing is cut off on a narrow phone.
 */
export const Toolbar = (props: ToolbarProps) => {
  const styles = useThemedStyles(makeStyles)
  const session = useDaemonSession(props.session)

  return (
    <View style={styles.root}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        style={styles.scroll}
        contentContainerStyle={styles.choices}
      >
        <IconButton
          icon="paperclip"
          label={CHAT.composer.attach}
          disabled={!props.enabled}
          onPress={props.onAttach}
        />
        {session && (
          <>
            <ModelPicker
              session={session.id}
              agent={session.agent}
              model={session.model ?? null}
              effort={session.effort ?? null}
              enabled={props.enabled}
            />
            <PermissionPicker
              session={session.id}
              mode={session.permissionMode}
              enabled={props.enabled}
            />
            <AgentPicker
              session={session.id}
              agent={session.agent}
              account={session.account}
              enabled={props.enabled}
            />
          </>
        )}
      </ScrollView>
      {props.working && (
        <IconButton
          icon="stop"
          variant="secondary"
          filled
          label={CHAT.composer.stop}
          disabled={!props.enabled}
          onPress={props.onStop}
        />
      )}
      {/* While the agent works, a message sent steers the turn; with nothing written, only stop. */}
      {(!props.working || props.filled) && (
        <IconButton
          icon="arrow-up"
          variant="primary"
          label={CHAT.composer.send}
          disabled={!props.enabled || !props.filled}
          onPress={props.onSend}
        />
      )}
    </View>
  )
}

const makeStyles = defineStyles((theme) => ({
  root: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm },
  scroll: { flex: 1 },
  choices: { alignItems: 'center', gap: theme.spacing.xs },
}))
