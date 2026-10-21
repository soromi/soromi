import { commandText, matchCommands } from '@soromi/core'
import { useCallback, useMemo } from 'react'
import { ScrollView, View } from 'react-native'

//Components
import { Option } from '@/components'

//Config
import { defineStyles, useThemedStyles } from '@/config/theme'

//Constants
import { CHAT } from '../constants/chat'

//State
import { useChatActions } from '@/states/chat/chat.state.hook'
import { useDaemonCommands } from '@/states/daemon/daemon.state.hook'

//Type
import type { SlashMenuProps } from '../types'

/**
 * The commands a message that starts with `/` could become, above the message box while one is
 * being typed. Picking one writes it in, with room for what follows; it is not sent.
 */
export const SlashMenu = (props: SlashMenuProps) => {
  const styles = useThemedStyles(makeStyles)
  const commands = useDaemonCommands(props.session)
  const actions = useChatActions()
  const session = props.session
  const draft = props.draft

  const matches = useMemo(() => matchCommands(commands ?? [], draft), [commands, draft])

  const handleSelect = useCallback(
    (name: string) => actions.setDraft(session, commandText({ name })),
    [actions, session],
  )

  if (matches.length === 0) return null

  return (
    <View style={styles.menu}>
      <ScrollView keyboardShouldPersistTaps="handled" style={styles.scroll}>
        {matches.map((command) => (
          <Option
            key={command.name}
            value={command.name}
            label={`${CHAT.slash.prefix}${command.name}`}
            hint={command.description}
            onSelect={handleSelect}
          />
        ))}
      </ScrollView>
    </View>
  )
}

const makeStyles = defineStyles((theme) => ({
  menu: {
    marginBottom: theme.spacing.sm,
    overflow: 'hidden',
    borderWidth: theme.borderWidth.hairline,
    borderColor: theme.border.default,
    borderRadius: theme.borderRadius.lg,
    backgroundColor: theme.surface.raised,
  },
  scroll: { maxHeight: CHAT.slash.maxHeight },
}))
