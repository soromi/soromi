import { View } from 'react-native'

//Config
import { defineStyles, useThemedStyles } from '@/config/theme'

//Components
import { PanelTab } from './tab'

//Constants
import { PANEL } from '../constants/panel'

//Type
import type { TabsProps } from '../types'

/**
 * The panel's views as a row of icons, as the desktop has them. It is shown in two places: in a
 * session's header, where each icon opens the panel on that view, and at the top of the panel
 * itself, where it moves between them.
 */
export const PanelTabs = (props: TabsProps) => {
  const styles = useThemedStyles(makeStyles)

  return (
    <View accessibilityRole="tablist" style={styles.root}>
      {PANEL.views.map((option) => (
        <PanelTab
          key={option.id}
          option={option}
          active={option.id === props.active}
          onSelect={props.onSelect}
        />
      ))}
    </View>
  )
}

const makeStyles = defineStyles((theme) => ({
  root: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing.xxs },
}))
