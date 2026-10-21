import { summarizeTools } from '@soromi/core'
import { useCallback, useMemo, useState } from 'react'
import { Pressable, View } from 'react-native'

//Components
import { Icon, Text } from '@/components'

//Config
import { defineStyles, useThemedStyles } from '@/config/theme'

//Components
import { ToolCall } from './tool'

//Type
import type { ToolGroupProps } from '../types'

/**
 * A run of tool calls folded under one line that sums them up ("Ran 4 · Skill 1"), so a turn that
 * reads or greps a dozen files stays tidy. It opens to the calls themselves.
 */
export const ToolGroup = (props: ToolGroupProps) => {
  const styles = useThemedStyles(makeStyles)
  const tools = props.tools
  const [open, setOpen] = useState(false)

  const summary = useMemo(() => summarizeTools(tools), [tools])

  const handleToggle = useCallback(() => setOpen((value) => !value), [])

  const state = useMemo(() => ({ expanded: open }), [open])

  return (
    <View>
      <Pressable
        accessibilityRole="button"
        accessibilityState={state}
        hitSlop={4}
        style={styles.head}
        onPress={handleToggle}
      >
        <Icon name="search" size={16} />
        <Text variant="bodySm" tone="muted">
          {summary}
        </Text>
        <Icon name={open ? 'chevron-up' : 'chevron-down'} size={14} />
      </Pressable>
      {open && (
        <View style={styles.calls}>
          {tools.map((tool, index) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: tool calls are positional within a group.
            <ToolCall key={index} tool={tool} />
          ))}
        </View>
      )}
    </View>
  )
}

const makeStyles = defineStyles((theme) => ({
  head: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
    paddingVertical: theme.spacing.xs,
  },
  calls: {
    marginTop: theme.spacing.xs,
    marginLeft: theme.spacing.sm,
    paddingLeft: theme.spacing.sm2,
    borderLeftWidth: 2,
    borderLeftColor: theme.border.default,
  },
}))
