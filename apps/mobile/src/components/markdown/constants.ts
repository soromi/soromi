//Type
import type { MarkdownConfig } from './types'

export const MARKDOWN: MarkdownConfig = {
  markers: {
    bullet: '•',
    checked: '☑',
    unchecked: '☐',
  },
  schemes: ['http:', 'https:', 'mailto:'],
  column: {
    perCharacter: 8,
    padding: 24,
    min: 64,
    max: 240,
  },
}
