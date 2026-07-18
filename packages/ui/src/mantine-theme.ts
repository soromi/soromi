import { createTheme } from '@mantine/core'

/**
 * The shared Mantine theme, used by both the desktop and web apps so every Mantine surface (menus,
 * modals, inputs, popovers) renders with the same dark greys, accent, radius, and fonts. The raw
 * color palette also lives in `theme.css` as `--soromi-*` vars; this maps the same greys onto
 * Mantine's `dark` scale so components that read Mantine tokens match.
 */
export const theme = createTheme({
  primaryColor: 'jade',
  // Rounder corners across Mantine components (menus, inputs, buttons, modals).
  defaultRadius: 'md',
  radius: {
    xs: '4px',
    sm: '6px',
    md: '10px',
    lg: '14px',
    xl: '20px',
  },
  colors: {
    jade: [
      '#e6faf0',
      '#c3f0da',
      '#98e6bf',
      '#6ddba4',
      '#4ed492',
      '#3ecf8e',
      '#35c07a',
      '#2fae6a',
      '#1f7a49',
      '#0f4a2c',
    ],
    // Warm-neutral dark surfaces for Mantine components (menus, inputs, borders).
    dark: [
      '#f0f0f0',
      '#c9c9cc',
      '#8a8a8e',
      '#6a6a6e',
      '#2f2f33',
      '#242427',
      '#161618',
      '#0f0f11',
      '#0d0d0f',
      '#0a0a0b',
    ],
  },
  fontFamily: '-apple-system, "Segoe UI", Inter, Roboto, sans-serif',
  fontFamilyMonospace: '"SF Mono", "Cascadia Code", "JetBrains Mono", Menlo, Consolas, monospace',
})
