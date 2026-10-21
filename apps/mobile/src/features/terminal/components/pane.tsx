import { useMemo } from 'react'
import { View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

//Components
import { Terminal } from '@/components'

//Config
import { defineStyles, useThemedStyles } from '@/config/theme'

//Components
import { Keys } from './keys'

//Hooks
import { useTerminal } from '../hooks/use-terminal'

//Type
import type { PaneProps } from '../types'

/**
 * A session's terminal, or a shell's, live: what the computer shows, to type into when this phone is in
 * control and to watch when it is not. Under it, while typing is possible, the keys a phone's
 * keyboard lacks.
 */
export const TerminalPane = (props: PaneProps) => {
  const styles = useThemedStyles(makeStyles)
  const insets = useSafeAreaInsets()
  const terminal = useTerminal(props.session, props.shell)

  // Clear of the home indicator.
  const inset = useMemo(() => ({ paddingBottom: insets.bottom }), [insets.bottom])

  return (
    <View style={[styles.root, inset]}>
      <Terminal
        terminalRef={terminal.terminal}
        driving={terminal.driving}
        onReady={terminal.handleReady}
        onInput={terminal.handleInput}
        onSize={terminal.handleSize}
      />
      {terminal.driving && <Keys onSend={terminal.handleInput} />}
    </View>
  )
}

const makeStyles = defineStyles((theme) => ({
  root: { flex: 1, backgroundColor: theme.surface.page },
}))
