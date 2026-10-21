import { useMemo } from 'react'
import { ScrollView, View } from 'react-native'

//Components
import { Text } from '@/components'

//Config
import { defineStyles, useThemedStyles } from '@/config/theme'

//Components
import { NewShell } from './new-shell'
import { TerminalPane } from './pane'
import { ShellTab } from './shell-tab'

//Constants
import { TERMINAL } from '../constants/terminal'

//Hooks
import { useShells } from '../hooks/use-shells'

//Type
import type { ShellsProps } from '../types'

/**
 * A workspace's terminals, as in the desktop's Terminal tab: plain shells on the computer, one on
 * screen at a time, with a strip above to move between them, open another, or close the one shown.
 */
export const Shells = (props: ShellsProps) => {
  const styles = useThemedStyles(makeStyles)
  const workspace = props.workspace
  const shells = useShells(workspace)
  const active = shells.active

  const spot = useMemo(
    () => (active ? { workspace, folder: active.folder } : undefined),
    [workspace, active],
  )

  return (
    <View style={styles.root}>
      <View style={styles.bar}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          keyboardShouldPersistTaps="always"
          style={styles.strip}
          contentContainerStyle={styles.tabs}
        >
          {shells.shells.map((shell) => (
            <ShellTab
              key={shell.id}
              shell={shell}
              active={shell.id === active?.id}
              onSelect={shells.handleSelect}
              onClose={shells.handleClose}
            />
          ))}
        </ScrollView>
        <NewShell workspace={workspace} onOpen={shells.handleOpen} />
      </View>
      {active ? (
        // One terminal at a time, started over for each: going back to one has the daemon draw
        // its screen again as it stands.
        <TerminalPane key={active.id} session={active.id} shell={spot} />
      ) : (
        <View style={styles.empty}>
          <Text variant="bodySm" tone="muted" style={styles.message}>
            {TERMINAL.shells.empty}
          </Text>
        </View>
      )}
    </View>
  )
}

const makeStyles = defineStyles((theme) => ({
  root: { flex: 1 },
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
    paddingHorizontal: theme.spacing.md,
    paddingBottom: theme.spacing.sm,
  },
  strip: { flex: 1 },
  tabs: { gap: theme.spacing.xs, alignItems: 'center' },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: theme.spacing.xl },
  message: { textAlign: 'center' },
}))
