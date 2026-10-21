import { useMemo } from 'react'
import { type ImageStyle, StyleSheet, type TextStyle, type ViewStyle } from 'react-native'

//Config
import { useTheme } from './provider'

//Type
import type { Theme } from './tokens'

export type NamedStyles<T> = {
  [P in keyof T]: ViewStyle | TextStyle | ImageStyle
}

/**
 * Wraps a style factory so its object literal is typed in context (`justifyContent: 'center'`
 * stays a literal, not a widened `string`) without callers writing `satisfies` themselves.
 */
export const defineStyles = <T extends NamedStyles<T>>(factory: (theme: Theme) => T) => factory

/**
 * Applies the current theme to a style factory defined outside the component, memoizing the
 * result. A component just calls `useThemedStyles(makeStyles)`.
 */
export const useThemedStyles = <
  // biome-ignore lint/suspicious/noExplicitAny: mirrors React Native's own StyleSheet.create constraint
  T extends NamedStyles<T> | NamedStyles<any>,
>(
  factory: (theme: Theme) => T,
): T => {
  const theme = useTheme()

  return useMemo(() => StyleSheet.create(factory(theme)), [theme, factory])
}
