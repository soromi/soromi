import { Stack, useLocalSearchParams } from 'expo-router'
import { useCallback, useMemo } from 'react'
import { RefreshControl, ScrollView, View } from 'react-native'

//Components
import { IconButton, Text } from '@/components'

//Config
import { layout } from '@/config/layout'
import { defineStyles, useTheme, useThemedStyles } from '@/config/theme'

//Features
import { LinkBanner } from '@/features/layout/components/link-banner'
import { AgentUsageCard } from '@/features/usage/components/agent'

//Constants
import { USAGE } from '@/features/usage/constants/usage'

//Helpers
import { getHeaderActions, getHeaderTitle } from '@/features/layout/helpers'
import { getAgentKey } from '@/features/usage/helpers'

//Hooks
import { useClock } from '@/hooks/use-clock'
import { useUsage } from '@/hooks/use-usage'

//State
import { useLinkOnline } from '@/states/link/link.state.hook'

/**
 * How much of their plans a workspace's agents have used: each agent's windows (the five-hour
 * session, the week) as bars, when each rolls over, and the agent's plan page. The computer reads
 * it from each account and keeps the reading a quarter of an hour; a pull, or the header's button,
 * has it read afresh.
 */
export const UsageScreen = () => {
  const styles = useThemedStyles(makeStyles)
  const theme = useTheme()
  const params = useLocalSearchParams<{ name: string }>()
  const workspace = params.name
  const online = useLinkOnline()
  const usage = useUsage(workspace)
  const now = useClock()
  const agents = usage.agents
  const refresh = usage.refresh
  const refreshing = usage.refreshing

  const renderRefresh = useCallback(
    () => (
      <IconButton
        icon="refresh"
        size="sm"
        label={USAGE.refresh}
        disabled={!online || refreshing}
        onPress={refresh}
      />
    ),
    [online, refreshing, refresh],
  )

  const options = useMemo(
    () => ({ ...getHeaderTitle(USAGE.title), ...getHeaderActions(renderRefresh) }),
    [renderRefresh],
  )

  const refreshControl = useMemo(
    () => (
      <RefreshControl refreshing={refreshing} tintColor={theme.text.muted} onRefresh={refresh} />
    ),
    [refreshing, refresh, theme],
  )

  return (
    <View style={styles.root}>
      <Stack.Screen options={options} />
      <LinkBanner />
      <ScrollView contentContainerStyle={styles.content} refreshControl={refreshControl}>
        <Text variant="bodySm" tone="muted">
          {USAGE.intro(workspace)}
        </Text>
        {agents === undefined ? (
          <Text variant="bodySm" tone="muted" style={styles.message}>
            {online ? USAGE.loading : USAGE.offline}
          </Text>
        ) : agents.length === 0 ? (
          <View style={styles.empty}>
            <Text variant="bodySemiBold" tone="heading">
              {USAGE.empty.title}
            </Text>
            <Text variant="bodySm" tone="muted" style={styles.message}>
              {USAGE.empty.hint}
            </Text>
          </View>
        ) : (
          agents.map((one) => <AgentUsageCard key={getAgentKey(one)} usage={one} now={now} />)
        )}
      </ScrollView>
    </View>
  )
}

const makeStyles = defineStyles((theme) => ({
  root: { flex: 1, backgroundColor: theme.surface.page },
  // Read in a column: on a wide screen it stops growing and sits in the middle.
  content: {
    width: '100%',
    maxWidth: layout.sheet,
    alignSelf: 'center',
    gap: theme.spacing.md,
    paddingHorizontal: theme.spacing.lg,
    paddingTop: theme.spacing.sm,
    paddingBottom: theme.spacing.xl,
  },
  empty: { alignItems: 'center', gap: theme.spacing.xs, paddingTop: theme.spacing.xl },
  message: { textAlign: 'center' },
}))
