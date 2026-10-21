import { useRouter } from 'expo-router'
import { useCallback } from 'react'
import { ScrollView } from 'react-native'

//Components
import { KeyboardView, Text } from '@/components'

//Config
import { layout } from '@/config/layout'
import { defineStyles, useThemedStyles } from '@/config/theme'

//Features
import { AppearanceChoice } from '@/features/settings/components/appearance'
import { ConnectionStats } from '@/features/settings/components/connection'
import { ComputerHost } from '@/features/settings/components/host'
import { RelayAddress } from '@/features/settings/components/relay'
import { SettingsSection } from '@/features/settings/components/section'
import { Unpair } from '@/features/settings/components/unpair'

//Constants
import { SETTINGS } from '@/features/settings/constants/settings'

/**
 * The app's own settings: what is about this phone, not about the computer (its workspaces are
 * set up there). One section per subject, so the next one has a place to go.
 */
export const SettingsScreen = () => {
  const styles = useThemedStyles(makeStyles)
  const router = useRouter()

  // Back to the home, which is where an unpaired phone is sent on to the pairing screen.
  const handleUnpaired = useCallback(() => {
    if (router.canDismiss()) router.dismissAll()
  }, [router])

  return (
    // The relay is typed in: the screen stays above the keyboard.
    <KeyboardView style={styles.root}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <SettingsSection title={SETTINGS.computer.title}>
          <ComputerHost />
          <Text variant="bodySm" tone="body">
            {SETTINGS.computer.about}
          </Text>
          <Unpair onUnpaired={handleUnpaired} />
        </SettingsSection>
        <SettingsSection title={SETTINGS.connection.title}>
          <ConnectionStats />
        </SettingsSection>
        <SettingsSection title={SETTINGS.appearance.title}>
          <AppearanceChoice />
        </SettingsSection>
        <SettingsSection title={SETTINGS.relay.title}>
          <RelayAddress />
        </SettingsSection>
      </ScrollView>
    </KeyboardView>
  )
}

const makeStyles = defineStyles((theme) => ({
  root: { flex: 1, backgroundColor: theme.surface.page },
  // Settings are read in a column: on a wide screen it stops growing and sits in the middle.
  content: {
    width: '100%',
    maxWidth: layout.sheet,
    alignSelf: 'center',
    gap: theme.spacing.lg,
    padding: theme.spacing.lg,
  },
}))
