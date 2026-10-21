import { useCallback } from 'react'
import { Alert } from 'react-native'

//Components
import { Button, Text } from '@/components'

//Constants
import { SETTINGS } from '../constants/settings'

//Hooks
import { useUnpair } from '@/hooks/use-unpair'

//Type
import type { UnpairProps } from '../types'

/** The way out of a pairing, after asking. */
export const Unpair = (props: UnpairProps) => {
  const unpair = useUnpair()
  const onUnpaired = props.onUnpaired

  const handleConfirm = useCallback(async () => {
    await unpair()
    onUnpaired()
  }, [unpair, onUnpaired])

  const handlePress = useCallback(
    () =>
      Alert.alert(SETTINGS.unpair.title, SETTINGS.unpair.message, [
        { text: SETTINGS.unpair.cancel, style: 'cancel' },
        {
          text: SETTINGS.unpair.confirm,
          style: 'destructive',
          onPress: () => void handleConfirm(),
        },
      ]),
    [handleConfirm],
  )

  return (
    <>
      <Button variant="secondary" label={SETTINGS.unpair.action} onPress={handlePress} />
      <Text variant="caption" tone="muted">
        {SETTINGS.unpair.hint}
      </Text>
    </>
  )
}
