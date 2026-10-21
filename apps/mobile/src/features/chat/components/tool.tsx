import {
  diffStat,
  toolDiff,
  toolHasBody,
  toolOpensByDefault,
  toolState,
  toolTarget,
  toolVerb,
} from '@soromi/core'
import { useCallback, useMemo, useState } from 'react'
import { Pressable, View } from 'react-native'

//Components
import { Icon, StatusDot, Text } from '@/components'

//Config
import { defineStyles, useThemedStyles } from '@/config/theme'

//Components
import { ToolBody } from './tool-body'

//Constants
import { CHAT } from '../constants/chat'

//Type
import type { ToolProps } from '../types'

/**
 * One tool call of the agent's, as a line of its work log: an icon and a verb for what it did,
 * what it did it to, and a dot for how it went. A call with something to show opens at a tap: an
 * edit to its diff (open from the start, since the change is the point), a command to its output.
 */
export const ToolCall = (props: ToolProps) => {
  const styles = useThemedStyles(makeStyles)
  const tool = props.tool
  const [open, setOpen] = useState(() => toolOpensByDefault(tool))

  const diff = useMemo(() => toolDiff(tool), [tool])
  const stat = useMemo(() => (diff ? diffStat(diff) : null), [diff])
  const expandable = toolHasBody(tool)
  const target = toolTarget(tool)

  const handleToggle = useCallback(() => setOpen((value) => !value), [])

  const state = useMemo(() => ({ expanded: open }), [open])

  return (
    <View>
      <Pressable
        accessibilityRole="button"
        accessibilityState={state}
        disabled={!expandable}
        hitSlop={4}
        style={styles.head}
        onPress={handleToggle}
      >
        <View style={styles.chevron}>
          {expandable && <Icon name={open ? 'chevron-down' : 'chevron-right'} size={13} />}
        </View>
        <Icon name={CHAT.tool.icons[tool.kind]} size={15} />
        <Text variant="bodySm" tone="body">
          {toolVerb(tool.kind, tool.name)}
        </Text>
        <Text variant="mono" tone="muted" numberOfLines={1} style={styles.target}>
          {target}
        </Text>
        {stat && (
          <Text variant="mono" tone="action">
            {`${CHAT.tool.added}${stat.add} `}
            <Text variant="mono" tone="danger">
              {`${CHAT.tool.removed}${stat.del}`}
            </Text>
          </Text>
        )}
        <StatusDot status={CHAT.tool.dots[toolState(tool)]} />
      </Pressable>
      {open && expandable && <ToolBody tool={tool} diff={diff} />}
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
  // Kept even when there is nothing to open, so the rows of a list line up.
  chevron: { width: 13 },
  target: { flex: 1 },
}))
