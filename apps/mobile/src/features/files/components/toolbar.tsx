import { View } from 'react-native'

//Components
import { Button, Segmented, Text } from '@/components'

//Config
import { defineStyles, useThemedStyles } from '@/config/theme'

//Constants
import { FILES } from '../constants/files'

//Type
import type { ToolbarProps } from '../types'

/**
 * Above a file: for a document, the choice between the page and its source; where a save stands;
 * and the way into editing, which turns into Save and Done while it is on.
 */
export const FileToolbar = (props: ToolbarProps) => {
  const styles = useThemedStyles(makeStyles)

  return (
    <View style={styles.root}>
      {props.document && !props.editing && (
        <View style={styles.modes}>
          <Segmented options={FILES.modes} value={props.mode} onChange={props.onMode} />
        </View>
      )}
      <Text
        variant="bodySm"
        tone={props.status === 'failed' ? 'danger' : 'muted'}
        numberOfLines={1}
        style={styles.status}
      >
        {props.status ? FILES.status[props.status] : ''}
      </Text>
      {props.editing ? (
        <>
          <Button size="sm" variant="plain" label={FILES.edit.done} onPress={props.onDone} />
          <Button
            size="sm"
            label={FILES.edit.save}
            disabled={!props.dirty || props.status === 'saving'}
            onPress={props.onSave}
          />
        </>
      ) : (
        props.editable && (
          <Button size="sm" variant="secondary" label={FILES.edit.edit} onPress={props.onEdit} />
        )
      )}
    </View>
  )
}

const makeStyles = defineStyles((theme) => ({
  root: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm2,
    minHeight: 48,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
    borderBottomWidth: theme.borderWidth.hairline,
    borderBottomColor: theme.border.default,
  },
  modes: { width: 170 },
  status: { flex: 1 },
}))
