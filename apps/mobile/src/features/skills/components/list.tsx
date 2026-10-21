import { useCallback, useMemo } from 'react'
import { FlatList, View } from 'react-native'

//Components
import { Loader, Text } from '@/components'

//Config
import { defineStyles, useThemedStyles } from '@/config/theme'

//Components
import { SkillRow } from './row'

//Constants
import { SKILLS } from '../constants/skills'

//Helpers
import { getSkillKey } from '../helpers'

//Hooks
import { useSkills } from '../hooks/use-skills'

//Type
import type { Skill } from '@soromi/protocol'
import type { ListRenderItemInfo } from 'react-native'
import type { ListProps } from '../types'

/** A session's slash commands and skills. Picking one starts a message with it. */
export const SkillList = (props: ListProps) => {
  const styles = useThemedStyles(makeStyles)
  const session = props.session
  const usable = props.usable
  const skills = useSkills(session)

  const renderItem = useCallback(
    (info: ListRenderItemInfo<Skill>) => (
      <SkillRow session={session} skill={info.item} usable={usable} />
    ),
    [session, usable],
  )

  const empty = useMemo(
    () => (
      <Text variant="bodySm" tone="muted" style={styles.message}>
        {SKILLS.copy.empty}
      </Text>
    ),
    [styles],
  )

  if (skills === undefined) {
    return (
      <View style={styles.center}>
        <Loader />
      </View>
    )
  }

  return (
    <FlatList
      data={skills}
      keyExtractor={getSkillKey}
      contentContainerStyle={styles.list}
      renderItem={renderItem}
      ListEmptyComponent={empty}
    />
  )
}

const makeStyles = defineStyles((theme) => ({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  list: { flexGrow: 1, paddingBottom: theme.spacing.xl },
  message: { padding: theme.spacing.xl, textAlign: 'center' },
}))
