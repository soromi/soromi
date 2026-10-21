import { useCallback, useState } from 'react'
import { ScrollView, View } from 'react-native'

//Components
import { Markdown, Picture, Text } from '@/components'

//Config
import { defineStyles, useThemedStyles } from '@/config/theme'

//Components
import { Code } from './code'
import { Editor } from './editor'
import { FileToolbar } from './toolbar'

//Constants
import { FILES } from '../constants/files'

//Helpers
import { isMarkdown } from '../helpers'

//Hooks
import { useEditor } from '../hooks/use-editor'

//Type
import type { FileMode, FileViewProps } from '../types'

/**
 * A file, drawn for what it is and editable in place: a document as a page or as its source, code
 * with its line numbers, a picture as itself, or a note that it cannot be shown. Editing swaps the view for a text box
 * holding a draft, which the toolbar saves to the computer.
 */
export const FileView = (props: FileViewProps) => {
  const styles = useThemedStyles(makeStyles)
  const file = props.file
  const document = isMarkdown(props.path)
  const editor = useEditor(props.workspace, props.path, file)
  // A document opens as a page; anything else is only ever its source.
  const [mode, setMode] = useState<FileMode>(document ? 'preview' : 'raw')

  const handleMode = useCallback((next: string) => setMode(next as FileMode), [])

  // Editing is of the source, whichever way the file was being read.
  const begin = editor.begin
  const handleEdit = useCallback(() => {
    setMode('raw')
    begin()
  }, [begin])

  if (file.image) {
    if (file.truncated) {
      return (
        <Text variant="bodySm" tone="muted" style={styles.message}>
          {FILES.copy.largePicture}
        </Text>
      )
    }

    return (
      <View style={styles.picture}>
        <Picture mediaType={file.image} data={file.content} label={props.path} />
      </View>
    )
  }

  if (file.binary) {
    return (
      <Text variant="bodySm" tone="muted" style={styles.message}>
        {FILES.copy.binary}
      </Text>
    )
  }

  return (
    <>
      <FileToolbar
        document={document}
        mode={mode}
        status={editor.status}
        editing={editor.editing}
        editable={editor.editable}
        dirty={editor.dirty}
        onMode={handleMode}
        onEdit={handleEdit}
        onSave={editor.save}
        onDone={editor.done}
      />
      {editor.draft !== null ? (
        <Editor value={editor.draft} onChange={editor.change} />
      ) : document && mode === 'preview' ? (
        <ScrollView contentContainerStyle={styles.document}>
          <Markdown text={file.content} />
          {file.truncated && (
            <Text variant="caption" tone="muted">
              {FILES.copy.truncated}
            </Text>
          )}
        </ScrollView>
      ) : (
        <Code path={props.path} content={file.content} truncated={file.truncated} />
      )}
    </>
  )
}

const makeStyles = defineStyles((theme) => ({
  picture: { flex: 1, padding: theme.spacing.md },
  message: { padding: theme.spacing.xl, textAlign: 'center' },
  document: { gap: theme.spacing.md, padding: theme.spacing.md },
}))
