import { useCallback, useState } from 'react'
import { View } from 'react-native'

//Components
import { Button, Input, Text } from '@/components'

//Config
import { defineStyles, useThemedStyles } from '@/config/theme'

//Constants
import { PAIRING } from '../constants/pairing'

//Type
import type { PasteProps } from '../types'

/** The other way in: the pairing code as text, for when it cannot be scanned. */
export const Paste = (props: PasteProps) => {
  const styles = useThemedStyles(makeStyles)
  const [code, setCode] = useState('')
  const onSubmit = props.onSubmit
  const onEdit = props.onEdit

  const handleChange = useCallback(
    (text: string) => {
      setCode(text)
      onEdit()
    },
    [onEdit],
  )

  const handleSubmit = useCallback(() => onSubmit(code), [onSubmit, code])

  return (
    <View style={styles.root}>
      <Text variant="captionSemiBold" tone="muted">
        {PAIRING.paste.label}
      </Text>
      <Input
        mono
        style={styles.input}
        value={code}
        onChangeText={handleChange}
        placeholder={PAIRING.paste.placeholder}
        autoCapitalize="none"
        autoCorrect={false}
        multiline
      />
      <Button
        variant="secondary"
        label={PAIRING.paste.submit}
        disabled={code.trim() === ''}
        onPress={handleSubmit}
      />
    </View>
  )
}

const makeStyles = defineStyles((theme) => ({
  root: { gap: theme.spacing.sm },
  input: { minHeight: 64, backgroundColor: theme.surface.sunken },
}))
