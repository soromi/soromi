//Components
import { Card } from '@/components'

//Components
import { EarlierConversations } from './earlier'
import { NewSession } from './new-session'
import { WorkspaceUsage } from './usage'

//Hooks
import { useUsage } from '@/hooks/use-usage'

//Type
import type { ActionsProps } from '../types'

/**
 * At the top of a workspace's screen, together on one card: start a session, carry on an earlier
 * one, and how much of their plans its agents have used (once the computer has a reading of it).
 */
export const WorkspaceActions = (props: ActionsProps) => {
  const name = props.workspace.name
  const agents = useUsage(name).agents

  return (
    <Card>
      <NewSession workspace={props.workspace} />
      <EarlierConversations workspace={name} />
      {agents && agents.length > 0 && <WorkspaceUsage workspace={name} agents={agents} />}
    </Card>
  )
}
