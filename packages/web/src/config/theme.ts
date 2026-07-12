import { createTheme } from '@mantine/core'

/**
 * The palette lives in `styles/theme.css` as CSS variables (`--soromi-*`). This holds the Mantine
 * theme plus the few color values JS itself needs (the xterm terminal theme).
 */
export const colors = {
  bgTerminal: '#0a0a0b',
  text: '#f0f0f0',
}

export const theme = createTheme({
  primaryColor: 'jade',
  defaultRadius: 'md',
  radius: { xs: '4px', sm: '6px', md: '10px', lg: '14px', xl: '20px' },
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
  },
})
