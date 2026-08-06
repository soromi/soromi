//Components
import {
  Reasoning as ElementsReasoning,
  ReasoningContent,
  ReasoningTrigger,
} from '../components/ai-elements/reasoning'

export interface ReasoningProps {
  /** The agent's thinking text (a transcript `thinking` block). */
  text: string
  /** The reasoning is still streaming in (auto-opens, shimmers "Thinking..."). */
  isStreaming?: boolean
}

/**
 * A "Thinking" block for an agent's reasoning, on Vercel AI Elements' `Reasoning` (collapsible, auto
 * opens while streaming and tucks away when done). Thin wrapper so the chat view keeps a simple
 * `text` API and the AI Elements composition lives in one place.
 */
export function Reasoning({ text, isStreaming = false }: ReasoningProps) {
  return (
    <ElementsReasoning isStreaming={isStreaming} defaultOpen={false} className="mb-0">
      <ReasoningTrigger />
      <ReasoningContent>{text}</ReasoningContent>
    </ElementsReasoning>
  )
}
