import { createContext, useContext, useMemo } from 'react'
import { useColorScheme } from 'react-native'

//Helpers
import { resolveTheme } from './tokens'

//State
import { usePreferencesAppearance } from '@/states/preferences/preferences.state.hook'

//Type
import type { ReactNode } from 'react'
import type { Theme } from './tokens'

const ThemeContext = createContext<Theme>(resolveTheme('dark'))

/**
 * The app's colours, in the appearance chosen in its settings: as the phone is set (the default),
 * or always light or dark. It changes live, with the phone's own setting too.
 */
export const ThemeProvider = (props: { children: ReactNode }) => {
  const system = useColorScheme()
  const appearance = usePreferencesAppearance()
  const scheme = appearance === 'system' ? (system === 'light' ? 'light' : 'dark') : appearance

  const theme = useMemo(() => resolveTheme(scheme), [scheme])

  return <ThemeContext.Provider value={theme}>{props.children}</ThemeContext.Provider>
}

export const useTheme = () => useContext(ThemeContext)
