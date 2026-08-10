//! Descriptions for Claude's slash commands ("actions"). The stream-json `system/init` frame lists
//! only command *names*, so we annotate them: built-ins from a static map, custom ones by reading the
//! `description:` frontmatter of their `.claude/commands/<name>.md` file (project then user scope).

use std::path::Path;

/// Resolves a one-line description for a Claude slash command: a built-in first, else a project/user
/// custom command's frontmatter. `None` when unknown (the menu then shows the bare name).
pub fn describe(name: &str, cwd: &Path) -> Option<String> {
    builtin(name)
        .map(str::to_string)
        .or_else(|| custom(name, cwd))
}

/// Descriptions for the built-in Claude Code commands (as of Claude Code 2.x). Names without a `/`.
fn builtin(name: &str) -> Option<&'static str> {
    let text = match name {
        "recap" => "Generate a one-line session recap now",
        "review" => "Review a GitHub pull request; for your working diff use /code-review",
        "resume" => "Resume a previous conversation",
        "rewind" => "Restore the code and/or conversation to a previous point",
        "rename" => "Rename the current conversation",
        "clear" => "Clear the conversation history and free up context",
        "compact" => "Summarize the conversation to free up context",
        "context" => "Visualize the current token usage of your context",
        "usage" => "Show your plan usage and rate limits",
        "cost" => "Show the token cost of the current session",
        "init" => "Create a CLAUDE.md with codebase documentation",
        "code-review" => "Review your current working changes",
        "security-review" => "Review the pending changes for security issues",
        "model" => "Change the active model",
        "agents" => "Manage and create custom subagents",
        "mcp" => "Manage MCP server connections",
        "memory" => "Edit Claude's memory files",
        "config" => "Open the settings / config panel",
        "doctor" => "Diagnose and verify your Claude Code installation",
        "help" => "Show help and available commands",
        "login" => "Sign in to your Anthropic account",
        "logout" => "Sign out of your Anthropic account",
        "status" => "Show the current session and account status",
        "vim" => "Toggle vim editing mode in the composer",
        "terminal-setup" => "Install key bindings for the terminal",
        _ => return None,
    };
    Some(text)
}

/// Reads a custom command's `description:` frontmatter from `.claude/commands/<name>.md`, checking the
/// project (`cwd`) then the user's home. Nested/namespaced names (`foo:bar`) map to `foo/bar.md`.
fn custom(name: &str, cwd: &Path) -> Option<String> {
    let rel = format!("{}.md", name.replace(':', "/"));
    let candidates = [
        Some(cwd.join(".claude/commands").join(&rel)),
        dirs::home_dir().map(|home| home.join(".claude/commands").join(&rel)),
    ];
    for path in candidates.into_iter().flatten() {
        if let Ok(text) = std::fs::read_to_string(&path) {
            if let Some(desc) = frontmatter_description(&text) {
                return Some(desc);
            }
        }
    }
    None
}

/// Pulls the `description:` value out of a leading `---`-fenced YAML frontmatter block, if present.
fn frontmatter_description(text: &str) -> Option<String> {
    let rest = text.strip_prefix("---\n")?;
    let end = rest.find("\n---")?;
    for line in rest[..end].lines() {
        if let Some(value) = line.trim().strip_prefix("description:") {
            let trimmed = value.trim().trim_matches(['"', '\'']).trim();
            if !trimmed.is_empty() {
                return Some(trimmed.to_string());
            }
        }
    }
    None
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn builtin_known_and_unknown() {
        assert_eq!(builtin("resume"), Some("Resume a previous conversation"));
        assert_eq!(builtin("totally-made-up"), None);
    }

    #[test]
    fn reads_frontmatter_description() {
        let md = "---\ndescription: Deploy the app\nallowed-tools: Bash\n---\nRun the deploy.";
        assert_eq!(frontmatter_description(md).as_deref(), Some("Deploy the app"));
    }

    #[test]
    fn no_frontmatter_is_none() {
        assert_eq!(frontmatter_description("Just a body, no fences."), None);
    }
}
