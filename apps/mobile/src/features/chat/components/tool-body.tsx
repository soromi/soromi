import { toolInput } from '@soromi/core'
import { useMemo } from 'react'
import { ScrollView, View } from 'react-native'

//Components
import { Text } from '@/components'

//Components
import { ResultImage } from './result-image'

//Config
import { defineStyles, useThemedStyles } from '@/config/theme'

//Constants
import { CHAT } from '../constants/chat'

//Helpers
import { clip, getDiffText, getMoreLabel, isImage } from '../helpers'

//Type
import type { ToolBodyProps } from '../types'

/**
 * What a tool row opens to: the change it made (as a diff), the content it wrote or the command
 * it ran, and under that what came back. Long ones scroll inside the panel, and very long ones are
 * cut with a count of what was left out.
 */
export const ToolBody = (props: ToolBodyProps) => {
  const styles = useThemedStyles(makeStyles)
  const tool = props.tool
  const diff = props.diff

  const lines = useMemo(() => (diff ? clip(diff, CHAT.tool.maxLines) : null), [diff])
  const output = useMemo(
    () => clip((tool.result?.text ?? '').split('\n'), CHAT.tool.maxLines),
    [tool.result],
  )
  // A command or written content as it was, or what a tool of no known kind (an MCP tool) was
  // sent, laid out to be read.
  const shown = tool.kind === 'write' || tool.kind === 'run' ? tool.body : toolInput(tool)
  // What the tool returned that is a picture: a screenshot it read, say.
  const pictures = useMemo(() => (tool.result?.files ?? []).filter(isImage), [tool.result])

  return (
    <View style={styles.panel}>
      <ScrollView nestedScrollEnabled style={styles.scroll}>
        {lines && (
          <View style={styles.block}>
            {lines.shown.map((line, index) => (
              <Text
                // biome-ignore lint/suspicious/noArrayIndexKey: diff lines are positional and static.
                key={index}
                variant="mono"
                style={[
                  styles.kept,
                  line.sign === '+' && styles.add,
                  line.sign === '-' && styles.del,
                ]}
              >
                {getDiffText(line)}
              </Text>
            ))}
            {lines.hidden > 0 && (
              <Text variant="caption" tone="muted">
                {getMoreLabel(lines.hidden)}
              </Text>
            )}
          </View>
        )}
        {shown && (
          <Text variant="mono" tone="body" selectable style={styles.block}>
            {tool.kind === 'run' ? `${CHAT.tool.prompt}${shown}` : shown}
          </Text>
        )}
        {pictures.length > 0 && (
          <View style={[styles.pictures, (lines || shown) && styles.result]}>
            {pictures.map((file, index) => (
              // biome-ignore lint/suspicious/noArrayIndexKey: a result's pictures have no stable id.
              <ResultImage key={index} file={file} />
            ))}
          </View>
        )}
        {tool.result?.text ? (
          <View style={[styles.block, (lines || shown) && styles.result]}>
            <Text variant="mono" tone={tool.result.ok ? 'muted' : 'danger'} selectable>
              {output.shown.join('\n')}
            </Text>
            {output.hidden > 0 && (
              <Text variant="caption" tone="muted">
                {getMoreLabel(output.hidden)}
              </Text>
            )}
          </View>
        ) : null}
      </ScrollView>
    </View>
  )
}

const makeStyles = defineStyles((theme) => ({
  panel: {
    marginTop: theme.spacing.xs,
    marginBottom: theme.spacing.sm,
    marginLeft: theme.spacing.lg,
    overflow: 'hidden',
    borderWidth: theme.borderWidth.hairline,
    borderColor: theme.border.default,
    borderRadius: theme.borderRadius.md,
    backgroundColor: theme.surface.raised,
  },
  scroll: { maxHeight: CHAT.tool.maxHeight },
  block: { paddingHorizontal: theme.spacing.sm2, paddingVertical: theme.spacing.sm },
  pictures: { gap: theme.spacing.sm, padding: theme.spacing.sm },
  result: { borderTopWidth: theme.borderWidth.hairline, borderTopColor: theme.border.default },
  kept: { paddingHorizontal: theme.spacing.xs, color: theme.text.body },
  add: { backgroundColor: theme.diff.add.background, color: theme.diff.add.text },
  del: { backgroundColor: theme.diff.del.background, color: theme.diff.del.text },
}))
