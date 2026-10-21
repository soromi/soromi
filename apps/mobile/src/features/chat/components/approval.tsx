import { useCallback } from 'react'
import { View } from 'react-native'

//Components
import { Button, Text } from '@/components'

//Config
import { defineStyles, useThemedStyles } from '@/config/theme'

//Constants
import { CHAT } from '../constants/chat'

//Services
import { LinkService } from '@/services/link'

//Type
import type { ApprovalProps } from '../types'

/** A tool call waiting for the user to allow or deny it. */
export const Approval = (props: ApprovalProps) => {
  const styles = useThemedStyles(makeStyles)
  const session = props.session
  const id = props.approval.id

  const handleAllow = useCallback(
    () => LinkService.send({ type: 'chat-approval-response', session, id, allow: true }),
    [session, id],
  )

  const handleDeny = useCallback(
    () => LinkService.send({ type: 'chat-approval-response', session, id, allow: false }),
    [session, id],
  )

  return (
    <View style={styles.card}>
      <Text variant="bodySmSemiBold">
        {CHAT.approval.lead}
        <Text variant="mono">{props.approval.name}</Text>
        {CHAT.approval.trail}
      </Text>
      {props.approval.path && (
        <Text variant="mono" tone="body" numberOfLines={1}>
          {props.approval.path}
        </Text>
      )}
      {props.approval.body && (
        <Text variant="mono" tone="body" numberOfLines={CHAT.approval.bodyLines}>
          {props.approval.body}
        </Text>
      )}
      <View style={styles.actions}>
        <Button
          size="sm"
          variant="secondary"
          label={CHAT.approval.deny}
          disabled={!props.enabled}
          onPress={handleDeny}
        />
        <Button
          size="sm"
          label={CHAT.approval.allow}
          disabled={!props.enabled}
          onPress={handleAllow}
        />
      </View>
    </View>
  )
}

const makeStyles = defineStyles((theme) => ({
  card: {
    gap: theme.spacing.sm,
    marginHorizontal: theme.spacing.sm2,
    marginBottom: theme.spacing.sm,
    padding: theme.spacing.sm2,
    borderRadius: theme.borderRadius.lg,
    borderWidth: theme.borderWidth.hairline,
    borderColor: theme.border.warn,
    backgroundColor: theme.surface.raised,
  },
  actions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: theme.spacing.sm,
    marginTop: theme.spacing.xs,
  },
}))
