import { agentLabel } from '@soromi/core'
import { View } from 'react-native'

//Components
import { Card, ProviderMark, Text } from '@/components'

//Config
import { defineStyles, useThemedStyles } from '@/config/theme'

//Components
import { AccountRow } from './account-row'
import { AddAccount } from './add-account'

//Type
import type { AgentAccountsProps } from '../types'

/**
 * One agent's card: its name, the accounts it runs under in this workspace (the first being its
 * sessions' own), and the way to add another that configures it.
 */
export const AgentAccounts = (props: AgentAccountsProps) => {
  const styles = useThemedStyles(makeStyles)
  const agent = props.agent

  return (
    <Card>
      <View key="head" style={styles.head}>
        <ProviderMark provider={agent} size={18} />
        <Text variant="bodySemiBold">{agentLabel(agent)}</Text>
      </View>
      {props.chosen.map((account, index) => (
        <AccountRow
          key={account}
          agent={agent}
          account={account}
          first={index === 0}
          removable={props.chosen.length > 1}
          onRemove={props.onRemove}
        />
      ))}
      {props.spare.length > 0 && (
        <AddAccount key="add" agent={agent} spare={props.spare} onAdd={props.onAdd} />
      )}
    </Card>
  )
}

const makeStyles = defineStyles((theme) => ({
  head: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
    minHeight: theme.control.md,
    paddingHorizontal: theme.spacing.md,
  },
}))
