//Components
import { IconButton } from '@/components'

//Constants
import { CHAT } from '../constants/chat'

//Type
import type { PanelActionProps } from '../types'

/**
 * The header's way to the side of a session: its workspace's files, its skills and its changes.
 * Where that opens is the screen's to say: a screen of its own on a phone, a pane on a tablet.
 */
export const PanelAction = (props: PanelActionProps) => (
  <IconButton icon="panel" label={CHAT.panel} onPress={props.onPress} />
)
