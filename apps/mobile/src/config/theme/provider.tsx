import { createContext, useContext, useMemo } from 'react'

//Helpers
import { resolveTheme } from './tokens'

//Type
import type { ReactNode } from 'react'
import type { Theme } from './tokens'

const ThemeContext = createContext<Theme>(resolveTheme('dark'))

export const ThemeProvider = (props: { children: ReactNode }) => {
  const theme = useMemo(() => resolveTheme('dark'), [])

  return <ThemeContext.Provider value={theme}>{props.children}</ThemeContext.Provider>
}

export const useTheme = () => useContext(ThemeContext)
