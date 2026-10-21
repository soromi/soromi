import { useCallback, useMemo, useState } from 'react'
import { Pressable, View } from 'react-native'

//Components
import { Icon, Text } from '@/components'

//Config
import { defineStyles, useThemedStyles } from '@/config/theme'

//Constants
import { CHAT } from '../constants/chat'

//Type
import type { ReasoningProps } from '../types'

/** The agent's reasoning, tucked under one line and shown at a tap: context, not the answer. */
export const Reasoning = (props: ReasoningProps) => {
  const styles = useThemedStyles(makeStyles)
  const [open, setOpen] = useState(false)

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
        <Icon name="brain" size={16} />
        <Text variant="bodySm" tone="muted">
          {CHAT.reasoning.label}
        </Text>
        <Icon name={open ? 'chevron-up' : 'chevron-down'} size={14} />
      </Pressable>
      {open && (
        <Text variant="bodySm" tone="muted" selectable style={styles.text}>
          {props.text}
        </Text>
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
  text: { paddingTop: theme.spacing.xs, paddingBottom: theme.spacing.sm },
}))
