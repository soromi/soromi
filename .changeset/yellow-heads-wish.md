---
"@soromi/desktop": major
---

- Native Claude chat: a fully integrated conversation view alongside the terminal.

  - **Inline image references in the composer.** Attached images become atomic `[image-N]` chips inside the prompt text (hover or click to preview), like Claude Code's terminal, instead of a separate thumbnail strip.
  - **Slash-command menu.** The provider's `/` actions (with descriptions) are available from the first keystroke, including built-ins such as `/compact`, `/clear`, `/model`, and `/context`.
  - **Format-aware attachment previews.** Images tile into a grid; PDFs, source files, audio/video, and archives get distinct icons, with an inline snippet for readable text/code.
  - **Model and reasoning-effort selector** plus a **permission-mode dropdown** in the composer, and an account/provider chip so it's clear which login a session runs under.
  - **Always-available Stop control** while the agent is working, `Esc` to interrupt, and a live "working" indicator.
  - **Context-full banner** offering Compact / Clear when the conversation nears the model's window.
  - **Signed and notarized macOS builds** (Developer ID): installs cleanly with native notifications and no Gatekeeper warning.
