import { Pressable, View } from 'react-native'

//Components
import { KeyboardView } from '@/components'

//Config
import { layout } from '@/config/layout'
import { defineStyles, useThemedStyles } from '@/config/theme'

//Constants
import { PANEL } from '@/features/panel/constants/panel'

//Screens
import { PanelBody } from './panel-body'

//Type
import type { PanelPaneProps } from './types'

/**
 * A session's panel on a wide screen: a column at the right of the conversation. Where the
 * screen is wide enough it takes its place beside the conversation; where it is not, it slides
 * over it, and a tap on what is left of the conversation closes it. Its terminal is typed into,
 * so the pane stays above the keyboard on its own.
 */
export const PanelPane = (props: PanelPaneProps) => {
  const styles = useThemedStyles(makeStyles)

  if (props.docked) {
    return (
      <KeyboardView style={styles.pane}>
        <PanelBody session={props.session} />
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
      <KeyboardView style={styles.pane}>
        <PanelBody session={props.session} />
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
  pane: {
    width: layout.panel,
    borderLeftWidth: theme.borderWidth.hairline,
    borderLeftColor: theme.border.default,
    backgroundColor: theme.surface.page,
  },
}))
