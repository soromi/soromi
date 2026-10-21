import { useMemo } from 'react'
import { KeyboardAvoidingView, Modal, Pressable, ScrollView, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

//Config
import { useTheme, useThemedStyles } from '@/config/theme'

//Components
import { Text } from '../text'

//Constants
import { SHEET } from './constants'

//Styles
import { makeStyles } from './styles'

//Type
import type { Props } from './types'

/**
 * A panel that rises from the bottom of the screen with a choice to make, over everything else.
 * A tap outside it, or the system's back gesture, asks to close it. It moves up with the
 * keyboard, for the ones that hold a text box.
 */
export const Sheet = (props: Props) => {
  const theme = useTheme()
  const styles = useThemedStyles(makeStyles)
  const insets = useSafeAreaInsets()

  // Clear of the home indicator.
  const inset = useMemo(
    () => ({ paddingBottom: Math.max(insets.bottom, theme.spacing.md) }),
    [insets.bottom, theme],
  )

  return (
    <Modal
      visible={props.visible}
      transparent
      animationType="fade"
      // Drawn under the system bars, so the dimming covers the whole screen.
      statusBarTranslucent
      navigationBarTranslucent
      onRequestClose={props.onClose}
    >
      <KeyboardAvoidingView behavior="padding" style={styles.root}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={SHEET.dismiss}
          style={styles.scrim}
          onPress={props.onClose}
        />
        <View style={[styles.card, inset]}>
          <View style={styles.grip} />
          <Text variant="label" tone="muted" style={styles.title}>
            {props.title}
          </Text>
          <ScrollView keyboardShouldPersistTaps="handled">{props.children}</ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  )
}
