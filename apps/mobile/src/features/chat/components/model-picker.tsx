import { effortLabel, modelSummary, selectedEffort, selectedModel } from '@soromi/core'
import { useCallback, useState } from 'react'

//Components
import { Chip, Option, Sheet, Text } from '@/components'

//Config
import { defineStyles, useThemedStyles } from '@/config/theme'

//Constants
import { CHAT } from '../constants/chat'

//Helpers
import { findModel, toModelKey } from '../helpers'

//Services
import { LinkService } from '@/services/link'

//State
import { useDaemonModels } from '@/states/daemon/daemon.state.hook'

//Type
import type { ModelPickerProps } from '../types'

/**
 * The session's model and, for a model that takes one, its reasoning effort. The provider lists
 * what there is to pick; one that lists nothing has no picker.
 */
export const ModelPicker = (props: ModelPickerProps) => {
  const styles = useThemedStyles(makeStyles)
  const [open, setOpen] = useState(false)
  const models = useDaemonModels(props.agent)
  const session = props.session
  const model = props.model
  const effort = props.effort

  const handleOpen = useCallback(() => setOpen(true), [])

  const handleClose = useCallback(() => setOpen(false), [])

  const handleModel = useCallback(
    (key: string) => {
      const option = models && findModel(models, key)
      setOpen(false)
      if (!option) return
      // The effort is kept for a model that takes one, and dropped for one that does not.
      LinkService.send({
        type: 'chat-set-model',
        session,
        model: option.value,
        effort: option.effort ? effort : null,
      })
    },
    [models, session, effort],
  )

  const handleEffort = useCallback(
    (level: string) => {
      setOpen(false)
      if (!models) return
      const current = selectedModel(models, model)
      LinkService.send({ type: 'chat-set-model', session, model: current.value, effort: level })
    },
    [models, session, model],
  )

  if (!models || models.models.length === 0) return null

  const current = selectedModel(models, model)
  const level = selectedEffort(models, effort)

  return (
    <>
      <Chip
        icon="sparkles"
        label={modelSummary(models, model, effort)}
        disabled={!props.enabled}
        onPress={handleOpen}
      />
      <Sheet visible={open} title={CHAT.model.title} onClose={handleClose}>
        {models.models.map((option) => (
          <Option
            key={toModelKey(option.value)}
            value={toModelKey(option.value)}
            label={option.label}
            hint={option.description}
            selected={option.value === current.value}
            onSelect={handleModel}
          />
        ))}
        {current.effort && (
          <>
            <Text variant="label" tone="muted" style={styles.heading}>
              {CHAT.model.effort}
            </Text>
            {models.effortLevels.map((one) => (
              <Option
                key={one}
                value={one}
                label={effortLabel(models, one)}
                selected={one === level}
                onSelect={handleEffort}
              />
            ))}
          </>
        )}
      </Sheet>
    </>
  )
}

const makeStyles = defineStyles((theme) => ({
  heading: {
    paddingHorizontal: theme.spacing.md,
    paddingTop: theme.spacing.md,
    paddingBottom: theme.spacing.xs,
  },
}))
