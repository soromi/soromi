import type { SyntaxPalette, SyntaxScope } from '@/config/theme'

/** A run of code of one colour. */
export type HighlightToken = {
  text: string
  /** What the run is; `plain` for what has no colour of its own. */
  scope: SyntaxScope
}

/** One line of code, as its coloured runs. An empty line has none. */
export type HighlightLine = HighlightToken[]

export type Props = {
  /** The runs to draw, inside a `Text` that sets the font. */
  tokens: HighlightLine
  /** The desktop palette to colour them with: a message's or a file's. */
  palette: SyntaxPalette
}

export type HighlightConfig = {
  /** The longest code coloured; longer is drawn plain, so a huge file still opens at once. */
  maxChars: number
  /** What each of the highlighter's names for a piece of code is drawn as. */
  scopes: Record<string, SyntaxScope>
  /** Keywords that steer the flow, which the file palette colours apart from the others. */
  control: ReadonlySet<string>
  /** Files known by their whole name rather than an extension, and the language each is in. */
  fileNames: Record<string, string>
}
