import { ScrollView } from 'react-native'

//Components
import { KeyboardView, Text } from '@/components'

//Config
import { defineStyles, useThemedStyles } from '@/config/theme'

//Features
import { Paste } from '@/features/pairing/components/paste'
import { Scanner } from '@/features/pairing/components/scanner'

//Constants
import { PAIRING } from '@/features/pairing/constants/pairing'

//Hooks
import { usePair } from '@/features/pairing/hooks/use-pair'

/**
 * Pairs the phone with a computer by reading the code its Soromi shows: scanned with the camera,
 * opened as a link, or pasted.
 */
export const PairScreen = () => {
  const styles = useThemedStyles(makeStyles)
  const pair = usePair()

  return (
    <KeyboardView style={styles.root}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Text variant="bodySm" tone="body">
          {PAIRING.steps}
        </Text>
        <Scanner onScan={pair.accept} />
        {pair.error && (
          <Text variant="bodySm" tone="danger">
            {pair.error}
          </Text>
        )}
        <Paste onSubmit={pair.accept} onEdit={pair.clearError} />
      </ScrollView>
    </KeyboardView>
  )
}

const makeStyles = defineStyles((theme) => ({
  root: { flex: 1, backgroundColor: theme.surface.page },
  content: { gap: theme.spacing.md, padding: theme.spacing.lg },
}))
