import { View } from 'react-native'

//Components
import { Logo, Text } from '@/components'

//Config
import { defineStyles, useThemedStyles } from '@/config/theme'

//Constants
import { NAVIGATION } from '../constants/navigation'

/** The app's mark and name, as the desktop has them at the top of its sidebar. */
export const Brand = () => {
  const styles = useThemedStyles(makeStyles)

  return (
    <View style={styles.root}>
      <Logo />
      <Text variant="heading3" numberOfLines={1}>
        {NAVIGATION.screens.sessions.title}
      </Text>
    </View>
  )
}

const makeStyles = defineStyles((theme) => ({
  root: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm2 },
}))
