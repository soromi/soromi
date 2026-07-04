/// A workspace `agent` field split into a command and its arguments.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct AgentCommand {
    pub command: String,
    pub args: Vec<String>,
}

/// Splits a workspace `agent` field into a command and its arguments on whitespace. No shell
/// parsing: quotes and globs are not interpreted.
pub fn parse_agent_command(agent: &str) -> Result<AgentCommand, String> {
    let mut parts = agent.split_whitespace();
    let command = parts
        .next()
        .ok_or_else(|| "workspace agent command is empty".to_string())?;
    Ok(AgentCommand {
        command: command.to_string(),
        args: parts.map(str::to_string).collect(),
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_a_bare_command() {
        assert_eq!(
            parse_agent_command("claude"),
            Ok(AgentCommand {
                command: "claude".into(),
                args: vec![],
            })
        );
    }

    #[test]
    fn splits_arguments_on_whitespace() {
        assert_eq!(
            parse_agent_command("claude --resume main"),
            Ok(AgentCommand {
                command: "claude".into(),
                args: vec!["--resume".into(), "main".into()],
            })
        );
    }

    #[test]
    fn ignores_surrounding_and_repeated_whitespace() {
        assert_eq!(
            parse_agent_command("  claude   --x  "),
            Ok(AgentCommand {
                command: "claude".into(),
                args: vec!["--x".into()],
            })
        );
    }

    #[test]
    fn errors_on_an_empty_command() {
        assert!(parse_agent_command("   ").is_err());
    }
}
