import { View } from 'react-native'

//Components
import { Backdrop, Icon, Text } from '@/components'

//Config
import { defineStyles, useThemedStyles } from '@/config/theme'

//Constants
import { PAIRING } from '../constants/pairing'

/**
 * The top of the pairing screen: a computer showing its pairing code, on the grid-and-glow
 * backdrop (the desktop draws a phone on the same one, beside the code), and what to do there.
 */
export const PairingHero = () => {
  const styles = useThemedStyles(makeStyles)

  return (
    <View style={styles.root}>
      <Backdrop height={PAIRING.hero.height} style={styles.backdrop}>
        <View style={styles.laptop}>
          <View style={styles.screen}>
            <View style={styles.code}>
              <Icon name="qr" size={34} tone="action" />
            </View>
          </View>
          <View style={styles.base} />
        </View>
      </Backdrop>
      <Text variant="bodySm" tone="body" style={styles.steps}>
        {PAIRING.steps}
      </Text>
    </View>
  )
}

const makeStyles = defineStyles((theme) => ({
  root: { gap: theme.spacing.sm2 },
  // Edge to edge across the screen, past its padding: the dots fade out before either side.
  backdrop: { marginHorizontal: -theme.spacing.lg },
  laptop: { alignItems: 'center' },
  screen: {
    width: 156,
    height: 100,
    alignItems: 'center',
    justifyContent: 'center',
    padding: theme.spacing.xs,
    borderRadius: theme.borderRadius.lg,
    borderWidth: theme.borderWidth.hairline,
    borderColor: theme.border.default,
    backgroundColor: theme.surface.raised,
  },
  code: {
    width: 58,
    height: 58,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: theme.borderRadius.md,
    borderWidth: theme.borderWidth.hairline,
    borderColor: theme.border.default,
    backgroundColor: theme.surface.page,
  },
  base: {
    width: 196,
    height: 8,
    marginTop: -1,
    borderBottomLeftRadius: theme.borderRadius.md,
    borderBottomRightRadius: theme.borderRadius.md,
    borderTopLeftRadius: theme.borderRadius.sm,
    borderTopRightRadius: theme.borderRadius.sm,
    borderWidth: theme.borderWidth.hairline,
    borderColor: theme.border.default,
    backgroundColor: theme.surface.active,
  },
  steps: { textAlign: 'center', paddingHorizontal: theme.spacing.sm },
}))
