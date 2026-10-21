import { useCallback, useState } from 'react'
import { View } from 'react-native'

//Components
import { Button, Input, Option, Sheet, Text } from '@/components'

//Config
import { defineStyles, useThemedStyles } from '@/config/theme'

//Constants
import { SESSIONS } from '../constants/sessions'

//Services
import { LinkService } from '@/services/link'

//Type
import type { MenuProps } from '../types'

/**
 * What a long press on a session offers: giving it a name, and closing it on the computer.
 * Renaming turns the sheet into a box to type the name in.
 */
export const SessionMenu = (props: MenuProps) => {
  const styles = useThemedStyles(makeStyles)
  const onClose = props.onClose
  const target = props.target
  // The name being typed; `null` while the menu shows its choices.
  const [title, setTitle] = useState<string | null>(null)

  const handleDismiss = useCallback(() => {
    setTitle(null)
    onClose()
  }, [onClose])

  const handleRename = useCallback(() => setTitle(target?.name ?? ''), [target])

  const handleSave = useCallback(() => {
    if (target && title !== null) {
      LinkService.send({ type: 'rename-session', session: target.id, title: title.trim() })
    }
    setTitle(null)
    onClose()
  }, [target, title, onClose])

  const handleCloseSession = useCallback(
    (session: string) => {
      onClose()
      LinkService.send({ type: 'close-session', session })
    },
    [onClose],
  )

  return (
    <Sheet visible={target !== null} title={target?.name ?? ''} onClose={handleDismiss}>
      {title === null ? (
        <>
          <Option value="rename" label={SESSIONS.menu.rename} onSelect={handleRename} />
          <Option
            value={target?.id ?? ''}
            label={SESSIONS.menu.close}
            hint={SESSIONS.menu.closeHint}
            onSelect={handleCloseSession}
          />
        </>
      ) : (
        <View style={styles.form}>
          <Input
            autoFocus
            value={title}
            placeholder={SESSIONS.menu.title}
            returnKeyType="done"
            onChangeText={setTitle}
            onSubmitEditing={handleSave}
          />
          <Text variant="caption" tone="muted">
            {SESSIONS.menu.renameHint}
          </Text>
          <Button label={SESSIONS.menu.save} onPress={handleSave} />
        </View>
      )}
    </Sheet>
  )
}

const makeStyles = defineStyles((theme) => ({
  form: {
    gap: theme.spacing.sm2,
    paddingHorizontal: theme.spacing.md,
    paddingBottom: theme.spacing.sm,
  },
}))
