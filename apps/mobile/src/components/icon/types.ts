//Config
import type { TextTone } from '@/config/theme'

/** The icons the app draws, named for what they show. */
export type IconName =
  | 'arrow-up'
  | 'bot'
  | 'brain'
  | 'check'
  | 'chevron-down'
  | 'chevron-right'
  | 'chevron-up'
  | 'clipboard'
  | 'close'
  | 'cloud'
  | 'code'
  | 'file'
  | 'file-text'
  | 'folder'
  | 'git'
  | 'grid'
  | 'image'
  | 'list'
  | 'lock'
  | 'panel'
  | 'pencil'
  | 'paperclip'
  | 'plus'
  | 'refresh'
  | 'search'
  | 'settings'
  | 'shield'
  | 'sparkles'
  | 'stop'
  | 'terminal'
  | 'wifi'
  | 'wrench'
  | 'write'

export type Props = {
  name: IconName
  /** Width and height, in points. */
  size?: number
  /** Which of the theme's text colours it is drawn in. */
  tone?: TextTone
  /**
   * A colour that is data and not the theme's, in place of `tone`: a file type's own, say. Never a
   * colour written in the app.
   */
  color?: string
  /** Filled in as well as outlined. */
  filled?: boolean
}
