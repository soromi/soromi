import 'streamdown/styles.css'

import { Streamdown } from 'streamdown'

//Components
import { codeComponents } from './code-block'

//Utils
import { cn } from '../../lib/utils'

export interface MarkdownProps {
  /** A complete markdown message (agent transcript prose). */
  children: string
  className?: string
  /** Animate the words in as they render (streamdown's `fadeIn`). Set for the message that's actively
   * arriving so it reveals gradually; leave off for settled/seeded history so it doesn't re-animate. */
  animate?: boolean
  /** The text is still streaming in and may end mid-syntax; lets streamdown close open code fences /
   * emphasis so a half-typed message doesn't flicker as broken markdown. */
  incomplete?: boolean
}

/**
 * Themed prose renderer for an agent's transcript messages, on top of `streamdown` (the same engine
 * Vercel AI Elements' `Response` uses) for markdown parsing, tables, lists, and word-level animation.
 * Fenced code renders through our own `CodeBlock` (`./code-block`) — modeled on AI Elements' CodeBlock,
 * Shiki-highlighted in one clean card — instead of streamdown's nested/overflowing default. Incomplete
 * parsing is on only while a message streams. The wrapper here maps text color + block rhythm onto
 * the `--soromi-*` tokens.
 */
export function Markdown({
  children,
  className,
  animate = false,
  incomplete = false,
}: MarkdownProps) {
  return (
    <Streamdown
      parseIncompleteMarkdown={incomplete}
      animated={{ animation: 'fadeIn', duration: 220, easing: 'ease-out', sep: 'word' }}
      isAnimating={animate}
      components={codeComponents}
      className={cn(
        'text-[12.5px] text-[var(--soromi-text)] leading-[1.55] [overflow-wrap:anywhere]',
        // Tighten default block spacing so a message reads as one bubble, not a document.
        '[&_h1]:mt-3 [&_h2]:mt-3 [&_h3]:mt-2 [&_ol]:my-2 [&_p]:my-2 [&_pre]:my-2 [&_ul]:my-2',
        // Shrink streamdown's default heading scale so prose reads as chat, not a document.
        '[&_h1]:text-[16px] [&_h1]:font-semibold [&_h2]:text-[14px] [&_h2]:font-semibold [&_h3]:text-[12.5px] [&_h3]:font-semibold',
        '[&_a]:text-[var(--soromi-accent)]',
        className,
      )}
    >
      {children}
    </Streamdown>
  )
}
