import { useRouter } from 'expo-router'
import { useCallback } from 'react'
import { Pressable } from 'react-native'

//Components
import { Text } from '@/components'

//Config
import { defineStyles, useThemedStyles } from '@/config/theme'

//Helpers
import { getSkillCommand, getSkillOrigin } from '../helpers'

//State
import { useChatActions } from '@/states/chat/chat.state.hook'

//Type
import type { PressableStateCallbackType } from 'react-native'
import type { RowProps } from '../types'

/**
 * One command or skill. Picking it writes `/name ` into the session's message box and goes back
 * there; it is not run, so arguments can be added before sending.
 */
export const SkillRow = (props: RowProps) => {
  const styles = useThemedStyles(makeStyles)
  const router = useRouter()
  const actions = useChatActions()
  const session = props.session
  const skill = props.skill
  const usable = props.usable

  const handlePick = useCallback(() => {
    actions.setDraft(session, `${getSkillCommand(skill)} `)
    router.back()
  }, [actions, router, session, skill])

  const getStyle = useCallback(
    (state: PressableStateCallbackType) => [styles.row, state.pressed && styles.pressed],
    [styles],
  )

  return (
    <Pressable accessibilityRole="button" disabled={!usable} style={getStyle} onPress={handlePick}>
      <Text variant="mono">{getSkillCommand(skill)}</Text>
      {skill.description && (
        <Text variant="bodySm" tone="body" numberOfLines={3}>
          {skill.description}
        </Text>
      )}
      <Text variant="caption" tone="muted">
        {getSkillOrigin(skill)}
      </Text>
    </Pressable>
  )
}

const makeStyles = defineStyles((theme) => ({
  row: {
    gap: theme.spacing.xs,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm2,
  },
  pressed: { backgroundColor: theme.surface.raised },
}))
