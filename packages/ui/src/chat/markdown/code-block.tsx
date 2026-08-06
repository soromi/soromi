import { Check, Copy } from 'lucide-react'
import { type ComponentProps, isValidElement, type ReactNode, useEffect, useState } from 'react'
import { type BundledLanguage, codeToHtml } from 'shiki'
import type { Streamdown } from 'streamdown'

/**
 * Fenced-code rendering for the chat markdown, modeled on Vercel AI Elements' CodeBlock: one clean
 * card (no nested body box, no horizontal-overflow-inside-a-box), Shiki-highlighted, with a language
 * label + copy in the header. Streamdown's own block nested a bordered body and overflowed awkwardly;
 * this replaces it. Inline code stays a chip; an untagged fence (no language for Shiki to color) is a
 * quiet plain block. Pass `codeComponents` to `<Streamdown components={...} />`.
 */
export const codeComponents = {
  pre: PassThrough,
  code: CodeChild,
} as ComponentProps<typeof Streamdown>['components']

function PassThrough({ children }: { children?: ReactNode }) {
  return <>{children}</>
}

function CodeChild({ className, children }: { className?: string; children?: ReactNode }) {
  const language = /language-(\w+)/.exec(className ?? '')?.[1]
  const raw = toText(children).replace(/\n$/, '')
  const isBlock = Boolean(language) || raw.includes('\n')
  if (!isBlock) {
    return (
      <code className="rounded bg-[var(--soromi-bg-active)] px-1.5 py-0.5 text-[0.85em] text-[var(--soromi-text-dim)] [font-family:var(--soromi-font-mono)]">
        {children}
      </code>
    )
  }
  if (language) {
    return <CodeBlock code={raw} language={language} />
  }
  // Untagged block: nothing for Shiki to color, so a quiet plain block.
  return (
    <pre className="my-2 overflow-x-auto rounded-[8px] bg-[var(--soromi-bg-hover)] px-3 py-2 text-[11.5px] text-[var(--soromi-text-dim)] leading-[1.5] [font-family:var(--soromi-font-mono)]">
      <code>{raw}</code>
    </pre>
  )
}

/** A Shiki-highlighted code card: header (language + copy) over the code, all in one bordered box. */
export function CodeBlock({ code, language }: { code: string; language: string }) {
  const [html, setHtml] = useState('')
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    let alive = true
    codeToHtml(code, { lang: language as BundledLanguage, theme: 'github-dark-default' })
      .then((out) => alive && setHtml(out))
      .catch(() => alive && setHtml('')) // unknown language: fall back to the plain <pre> below
    return () => {
      alive = false
    }
  }, [code, language])

  const copy = () => {
    navigator.clipboard?.writeText(code).then(
      () => {
        setCopied(true)
        setTimeout(() => setCopied(false), 1200)
      },
      () => {},
    )
  }

  return (
    <div className="my-2 overflow-hidden rounded-[10px] border border-[var(--soromi-border)] bg-[var(--soromi-bg-active)]">
      <div className="flex items-center justify-between border-[var(--soromi-border)] border-b py-1.5 pr-2 pl-3">
        <span className="text-[11px] text-[var(--soromi-text-faint)] [font-family:var(--soromi-font-mono)]">
          {language}
        </span>
        <button
          type="button"
          onClick={copy}
          aria-label="Copy code"
          className="flex h-6 w-6 cursor-pointer appearance-none items-center justify-center rounded-md border-none bg-transparent text-[var(--soromi-text-faint)] hover:bg-[var(--soromi-bg-hover)] hover:text-[var(--soromi-text-dim)]"
        >
          {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
        </button>
      </div>
      {html ? (
        // Shiki emits its own <pre> with an inline background; strip it so our card surface shows.
        <div
          className="overflow-x-auto px-3 py-2.5 text-[12px] leading-[1.5] [&>pre]:!bg-transparent [&>pre]:m-0 [&_code]:[font-family:var(--soromi-font-mono)]"
          // biome-ignore lint/security/noDangerouslySetInnerHtml: shiki's highlighted HTML.
          dangerouslySetInnerHTML={{ __html: html }}
        />
      ) : (
        <pre className="m-0 overflow-x-auto px-3 py-2.5 text-[12px] text-[var(--soromi-text-dim)] leading-[1.5] [font-family:var(--soromi-font-mono)]">
          <code>{code}</code>
        </pre>
      )}
    </div>
  )
}

/** Flattens react-markdown's code children (strings, nested animate spans) into raw text. */
function toText(node: ReactNode): string {
  if (node == null || node === false) return ''
  if (typeof node === 'string' || typeof node === 'number') return String(node)
  if (Array.isArray(node)) return node.map(toText).join('')
  if (isValidElement(node)) return toText((node.props as { children?: ReactNode }).children)
  return ''
}
