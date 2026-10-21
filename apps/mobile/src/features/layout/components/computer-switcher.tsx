import { useRouter } from 'expo-router'
import { useCallback, useState } from 'react'
import { Pressable, View } from 'react-native'

//Components
import { Icon, Logo, Option, Sheet, Text } from '@/components'

//Config
import { routes } from '@/config/router'
import { defineStyles, useThemedStyles } from '@/config/theme'

//Constants
import { COMPUTERS } from '../constants/computers'

//Services
import { ComputersService } from '@/services/computers'

//State
import { useLinkComputers, useLinkDevice } from '@/states/link/link.state.hook'

//Type
import type { PressableStateCallbackType } from 'react-native'

/**
 * The top of the home: the app's mark and the computer in use, by its name. A tap lists every
 * computer the phone is paired with to move to another, and a way to pair one more.
 */
export const ComputerSwitcher = () => {
  const styles = useThemedStyles(makeStyles)
  const router = useRouter()
  const computers = useLinkComputers()
  const device = useLinkDevice()
  const [open, setOpen] = useState(false)
  const current = computers.find((one) => one.pairing.device === device)

  const handleOpen = useCallback(() => setOpen(true), [])
  const handleClose = useCallback(() => setOpen(false), [])

  const handleSelect = useCallback(
    (value: string) => {
      setOpen(false)
      if (value === COMPUTERS.pairValue) router.push(routes.pairing.pair)
      else void ComputersService.use(value)
    },
    [router],
  )

  const getStyle = useCallback(
    (state: PressableStateCallbackType) => [styles.root, state.pressed && styles.pressed],
    [styles],
  )

  return (
    <>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={COMPUTERS.open}
        style={getStyle}
        onPress={handleOpen}
      >
        <Logo />
        <Text variant="heading3" numberOfLines={1} style={styles.name}>
          {current?.name ?? COMPUTERS.unnamed}
        </Text>
        <Icon name="chevron-down" size={16} tone="muted" />
      </Pressable>
      <Sheet visible={open} title={COMPUTERS.title} onClose={handleClose}>
        <View>
          {computers.map((computer) => (
            <Option
              key={computer.pairing.device}
              value={computer.pairing.device}
              label={computer.name ?? COMPUTERS.unnamed}
              hint={computer.pairing.device === device ? COMPUTERS.inUse : undefined}
              selected={computer.pairing.device === device}
              onSelect={handleSelect}
            />
          ))}
          <Option
            value={COMPUTERS.pairValue}
            label={COMPUTERS.pair}
            hint={COMPUTERS.pairHint}
            onSelect={handleSelect}
          />
        </View>
      </Sheet>
    </>
  )
}

const makeStyles = defineStyles((theme) => ({
  root: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm2, flexShrink: 1 },
  pressed: { opacity: 0.6 },
  name: { flexShrink: 1 },
}))
