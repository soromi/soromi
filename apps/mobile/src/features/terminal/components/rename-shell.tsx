import { useCallback, useEffect, useState } from 'react'
import { View } from 'react-native'

//Components
import { Button, Input, Sheet } from '@/components'

//Config
import { defineStyles, useThemedStyles } from '@/config/theme'

//Constants
import { TERMINAL } from '../constants/terminal'

//Services
import { LinkService } from '@/services/link'

//Type
import type { RenameShellProps } from '../types'

/**
 * What a long press on a terminal's tab opens: a box to give it another name. The daemon renames
 * it for every device, the desktop's Terminal tab included.
 */
export const RenameShell = (props: RenameShellProps) => {
  const styles = useThemedStyles(makeStyles)
  const target = props.target
  const onClose = props.onClose
  const [title, setTitle] = useState('')

  // Starts from the name it has, each time the sheet opens on one.
  useEffect(() => {
    if (target) setTitle(target.title)
  }, [target])

  const handleSave = useCallback(() => {
    const name = title.trim()
    // An empty name would be ignored by the daemon; nothing is sent for it.
    if (target && name && name !== target.title) {
      LinkService.send({ type: 'rename-shell', shell: target.id, title: name })
    }
    onClose()
  }, [target, title, onClose])

  return (
    <Sheet visible={target !== null} title={TERMINAL.shells.rename} onClose={onClose}>
      <View style={styles.form}>
        <Input
          autoFocus
          value={title}
          placeholder={TERMINAL.shells.name}
          returnKeyType="done"
          onChangeText={setTitle}
          onSubmitEditing={handleSave}
        />
        <Button label={TERMINAL.shells.save} disabled={!title.trim()} onPress={handleSave} />
      </View>
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
