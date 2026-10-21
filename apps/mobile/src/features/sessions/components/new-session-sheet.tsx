import { agentOptionKey } from '@soromi/core'

//Components
import { Option, ProviderMark, Sheet } from '@/components'

//Constants
import { SESSIONS } from '../constants/sessions'

//Type
import type { NewSessionSheetProps } from '../types'

/** Which agent a new session runs, when the workspace runs more than one. */
export const NewSessionSheet = (props: NewSessionSheetProps) => (
  <Sheet visible={props.visible} title={SESSIONS.create.title} onClose={props.onClose}>
    {props.options.map((option) => (
      <Option
        key={agentOptionKey(option.agent, option.account)}
        value={agentOptionKey(option.agent, option.account)}
        label={option.label}
        hint={option.accountLabel}
        leading={<ProviderMark provider={option.agent} size={20} />}
        onSelect={props.onSelect}
      />
    ))}
  </Sheet>
)
