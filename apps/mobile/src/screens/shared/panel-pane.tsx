import { useMemo } from 'react'
import { Pressable, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

//Components
import { IconButton, KeyboardView } from '@/components'

//Config
import { layout } from '@/config/layout'
import { defineStyles, useThemedStyles } from '@/config/theme'

//Features
import { PanelTabs } from '@/features/panel/components/tabs'

//Constants
import { PANEL } from '@/features/panel/constants/panel'

//Screens
import { PanelBody } from './panel-body'

//Type
import type { PanelPaneProps } from './types'

/**
 * A session's panel on a wide screen: a column at the right of the conversation, from the top of
 * the screen down, as on the desktop. Its icons are on the same line as the session's own top row,
 * which is where they were before it opened. Where the screen is wide enough it takes its place
 * beside the conversation; where it is not, it slides over it, and a tap on what is left of the
 * conversation closes it. Its terminal is typed into,
 * so the pane stays above the keyboard on its own.
 */
export const PanelPane = (props: PanelPaneProps) => {
  const styles = useThemedStyles(makeStyles)
  const insets = useSafeAreaInsets()

  // The pane runs the height of the screen, beside the session's own top row: clear of the status
  // bar, and of a rounded corner when the device is on its side.
  const inset = useMemo(
    () => ({ paddingTop: insets.top, paddingRight: insets.right }),
    [insets.top, insets.right],
  )

  // The views to move between, and the way out: the header's own icons are away while this is up.
  const bar = (
    <View style={styles.bar}>
      <PanelTabs active={props.view} onSelect={props.onView} />
      <IconButton icon="close" size="sm" label={PANEL.close} onPress={props.onClose} />
    </View>
  )

  if (props.docked) {
    return (
      <KeyboardView style={[styles.pane, inset]}>
        {bar}
        <PanelBody session={props.session} view={props.view} />
      </KeyboardView>
    )
  }

  return (
    <View style={styles.over}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={PANEL.close}
        style={styles.scrim}
        onPress={props.onClose}
      />
      <KeyboardView style={[styles.pane, inset]}>
        {bar}
        <PanelBody session={props.session} view={props.view} />
      </KeyboardView>
    </View>
  )
}

const makeStyles = defineStyles((theme) => ({
  over: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    flexDirection: 'row',
  },
  scrim: { flex: 1, backgroundColor: theme.surface.scrim },
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: layout.header,
    paddingHorizontal: theme.spacing.sm2,
    borderBottomWidth: theme.borderWidth.hairline,
    borderBottomColor: theme.border.subtle,
  },
  pane: {
    width: layout.panel,
    borderLeftWidth: theme.borderWidth.hairline,
    borderLeftColor: theme.border.default,
    backgroundColor: theme.surface.page,
  },
}))
